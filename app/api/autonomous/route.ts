import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const WORKER_FID = parseInt(process.env.WORKER_FID || '994355');
const WORKER_USERNAME = process.env.WORKER_USERNAME || 'mosss';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.1-70b-versatile';
// Reputation system constants
const REPUTATION_PER_TASK = 10; // Points awarded per completed task
const REPUTATION_BONUS_FACTOR = 0.1; // Bonus based on task reward

async function getRedis() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token });
}

async function getGroq() {
  if (!GROQ_API_KEY) return null;
  const { Groq } = await import('groq-sdk');
  return new Groq({ apiKey: GROQ_API_KEY });
}

async function getOpenBounties(redis: any) {
  try {
    const bountyIds = await redis.smembers('bounties:all');
    if (!bountyIds || !Array.isArray(bountyIds)) {
      console.log('[auto-worker] No bounties found or invalid data');
      return [];
    }
    
    const bounties: any[] = [];
    for (const key of bountyIds) {
      if (!key) continue;
      const data = await redis.get(`bounty:${key}`);
      if (!data) continue;
      
      const bounty = typeof data === 'string' ? JSON.parse(data) : data;
      if (bounty && bounty.status === 'open') {
        bounties.push(bounty);
      }
    }
    console.log(`[auto-worker] Found ${bounties.length} open bounties`);
    return bounties;
  } catch (e) {
    console.error('[auto-worker] getOpenBounties error:', e);
    return [];
  }
}

async function getAssignedBounties(redis: any) {
  try {
    const bountyIds = await redis.smembers('bounties:all');
    const bountyIdsArray = Array.isArray(bountyIds) ? bountyIds : [];
    const bounties = [];
    for (const key of bountyIdsArray) {
      const data = await redis.get(`bounty:${key}`);
      if (data) {
        const bounty = typeof data === 'string' ? JSON.parse(data) : data;
        if (bounty.status === 'assigned') {
          bounties.push(bounty);
        }
      }
    }
    return bounties;
  } catch (e) {
    console.error('[auto-worker] getAssignedBounties error:', e);
    return [];
  }
}

async function acceptBid(redis: any, bountyId: string, workerFid: number, workerUsername: string): Promise<boolean> {
  try {
    const bountyData = await redis.get(`bounty:${bountyId}`);
    if (!bountyData) return false;
    const bounty = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
    // Only accept if still open
    if (bounty.status !== 'open') return false;
    // Update bounty to assigned
    const updatedBounty = {
      ...bounty,
      status: 'assigned',
      workerFid,
      workerUsername,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    await redis.set(`bounty:${bountyId}`, JSON.stringify(updatedBounty));
    console.log(`[auto-worker] Auto-accepted bid for bounty ${bountyId}`);
    return true;
  } catch (e) {
    console.error('[auto-worker] acceptBid error:', e);
    return false;
  }
}

async function getBounties(redis: any) {
  try {
    const bountyIds = await redis.smembers('bounties:all');
    const bountyIdsArray = Array.isArray(bountyIds) ? bountyIds : [];
    const bounties = [];
    for (const key of bountyIdsArray) {
      const data = await redis.get(`bounty:${key}`);
      if (data) {
        const bounty = typeof data === 'string' ? JSON.parse(data) : data;
        if (bounty.status === 'open') {
          bounties.push(bounty);
        }
      }
    }
    return bounties;
  } catch (e) {
    console.error('[auto-worker] getBounties error:', e);
    return [];
  }
}

async function getExistingBids(redis: any, bountyId: string) {
  try {
    const bidIds = await redis.smembers(`bounty:${bountyId}:bids`);
    const bidIdsArray = Array.isArray(bidIds) ? bidIds : [];
    const bids = [];
    for (const key of bidIdsArray) {
      const data = await redis.get(`bid:${bountyId}:${key}`);
      if (data) {
        bids.push(typeof data === 'string' ? JSON.parse(data) : data);
      }
    }
    return bids;
  } catch (e) {
    return [];
  }
}

async function alreadyBid(bountyId: string, agentFid: number): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  
  try {
    const bidIds = await redis.smembers(`bounty:${bountyId}:bids`);
    const bidIdsArray = Array.isArray(bidIds) ? bidIds : [];
    
    for (const bidId of bidIdsArray) {
      const bidData = await redis.get(`bid:${bidId}`);
      if (bidData) {
        const bid = typeof bidData === 'string' ? JSON.parse(bidData) : bidData;
        if (bid.agentFid === agentFid) return true;
      }
    }
    return false;
  } catch (e) {
    console.error('[auto-worker] alreadyBid error:', e);
    return false;
  }
}
    }
    return false;
  } catch (e) {
    console.error('[auto-worker] alreadyBid error:', e);
    return false;
  }
}
    }
    return false;
  } catch (e) {
    console.error('[auto-worker] alreadyBid error:', e);
    return false;
  }
}

async function shouldBidOnBounty(bounty: any, groq: any): Promise<boolean> {
  // If no Groq, be more permissive for testing
  if (!groq) {
    console.log('[auto-worker] No Groq, defaulting to bid for testing');
    return true;
  }

  // Always bid on very simple tasks for testing/demo purposes
  const simpleTasks = ['what is 2+2', 'reply with exactly', 'say hello', 'translate'];
  const taskLower = bounty.task.toLowerCase();
  for (const simple of simpleTasks) {
    if (taskLower.includes(simple)) {
      console.log(`[auto-worker] Simple task detected: ${bounty.task}`);
      return true;
    }
  }

  console.log(`[auto-worker] Evaluating complex task: ${bounty.task}`);
  const prompt = `You are an autonomous AI worker evaluating whether to accept a bounty task.

Bounty Details:
- ID: ${bounty.id}
- Task: ${bounty.task}
- Type: ${bounty.type || 'simple'}
- Reward: ${bounty.reward} USDC
- Posted by: @${bounty.posterUsername || 'unknown'}

Evaluate whether you can complete this task effectively. Consider:
1. Do you understand the task?
2. Can you complete it with AI (translation, summarization, research, writing)?
3. Is the reward fair for the effort?

Respond with ONLY "YES" or "NO" followed by a brief reason.
Example: "YES - Clear translation task, reasonable pay"
Example: "NO - Requires physical action I cannot do"`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log(`[auto-worker] AI decision for ${bounty.id}: ${response}`);
    const shouldBid = response.trim().toUpperCase().startsWith('YES');
    console.log(`[auto-worker] Bidding decision for ${bounty.id}: ${shouldBid}`);
    return shouldBid;
  } catch (e) {
    console.error('[auto-worker] shouldBidOnBounty error:', e);
    return true; // Default to bidding on error for testing
  }
}

  // Always bid on very simple tasks for testing/demo purposes
  const simpleTasks = ['what is 2+2', 'reply with exactly', 'say hello', 'translate'];
  const taskLower = bounty.task.toLowerCase();
  for (const simple of simpleTasks) {
    if (taskLower.includes(simple)) {
      console.log(`[auto-worker] Simple task detected: ${bounty.task}`);
      return true;
    }
  }

  const prompt = `You are an autonomous AI worker evaluating whether to accept a bounty task.

Bounty Details:
- ID: ${bounty.id}
- Task: ${bounty.task}
- Type: ${bounty.type || 'simple'}
- Reward: ${bounty.reward} USDC
- Posted by: @${bounty.posterUsername || 'unknown'}

Evaluate whether you can complete this task effectively. Consider:
1. Do you understand the task?
2. Can you complete it with AI (translation, summarization, research, writing)?
3. Is the reward fair for the effort?

Respond with ONLY "YES" or "NO" followed by a brief reason.
Example: "YES - Clear translation task, reasonable pay"
Example: "NO - Requires physical action I cannot do"`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log(`[auto-worker] AI decision for ${bounty.id}: ${response}`);
    return response.trim().toUpperCase().startsWith('YES');
  } catch (e) {
    console.error('[auto-worker] shouldBidOnBounty error:', e);
    return true; // Default to bidding on error for testing
  }
}

async function submitBid(redis: any, bounty: any, groq: any): Promise<boolean> {
  if (!WORKER_FID) {
    console.log('[auto-worker] No WORKER_FID configured');
    return false;
  }

  const bidId = `bid_${Date.now()}`;
  const proposal = await generateProposal(bounty, groq);
  const priceUsdc = bounty.reward || 1;

    try {
      const bidData = {
        id: bidId,
        bountyId: bounty.id,
        agentFid: WORKER_FID,
        agentUsername: WORKER_USERNAME,
        proposal,
        priceUsdc,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      };

      await redis.set(`bid:${bidId}`, JSON.stringify(bidData));
      await redis.sadd(`bounty:${bounty.id}:bids`, bidId);

      const currentBids = (bounty.bidCount || 0) + 1;
      await redis.set(`bounty:${bounty.id}`, JSON.stringify({ ...bounty, bidCount: currentBids }));

      console.log(`[auto-worker] Submitted bid ${bidId} on ${bounty.id}`);
      return true;
    } catch (e) {
      console.error('[auto-worker] submitBid error:', e);
      return false;
    }
}

async function generateProposal(bounty: any, groq: any): Promise<string> {
  if (!groq) {
    return 'AI-powered task execution using Groq LLM';
  }

  const taskType = bounty.type || 'simple';
  let approach = '';

  switch (taskType) {
    case 'translate':
      approach = 'Accurate translation using Groq LLM with context awareness';
      break;
    case 'summarize':
      approach = 'Concise summarization highlighting key points';
      break;
    case 'onchain-lookup':
      approach = 'On-chain data retrieval via Base RPC';
      break;
    default:
      approach = 'AI-powered task execution with Groq LLM';
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Generate a brief 1-2 sentence proposal for this task. Be professional and concise.' },
        { role: 'user', content: `Task: ${bounty.task}` },
      ],
      max_tokens: 100,
    });

    const aiProposal = completion.choices[0]?.message?.content || '';
    return `${approach}. ${aiProposal}`;
  } catch (e) {
    return approach;
  }
}

async function executeTask(bounty: any): Promise<string> {
  const groq = await getGroq();
  if (!groq) {
    return '[No Groq SDK configured]';
  }

  const taskType = bounty.type || 'simple';

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: getSystemPrompt(taskType) },
        { role: 'user', content: bounty.task },
      ],
      max_tokens: 1000,
    });

    const result = completion.choices[0]?.message?.content || '[execution failed]';
    console.log(`[auto-worker] Executed ${bounty.id}: ${result.substring(0, 100)}...`);
    return result;
  } catch (e) {
    console.error('[auto-worker] executeTask error:', e);
    return `[execution error: ${e instanceof Error ? e.message : 'unknown'}]`;
  }
}

function getSystemPrompt(taskType: string): string {
  switch (taskType) {
    case 'translate':
      return 'You are a translation engine. Translate the given text accurately and naturally.';
    case 'summarize':
      return 'You are a summarization engine. Provide a clear, concise summary of the content.';
    case 'onchain-lookup':
      return 'You are a blockchain researcher. Provide accurate on-chain data and insights.';
    default:
      return 'You are an AI task executor. Complete the task professionally and provide the result.';
  }
}

async function updateWorkerStats(redis: any, taskCompleted: boolean, rewardAmount: number): Promise<void> {
  try {
    if (!redis) return;
    
    // Update task completion count
    await redis.hincrby(`worker:stats:${WORKER_FID}`, 'tasksCompleted', taskCompleted ? 1 : 0);
    
    // Update total earnings
    if (taskCompleted && rewardAmount > 0) {
      await redis.hincrbyfloat(`worker:stats:${WORKER_FID}`, 'totalEarnedUsdc', rewardAmount);
    }
    
    // Update reputation score
    if (taskCompleted) {
      const reputationGain = REPUTATION_PER_TASK + Math.floor(rewardAmount * REPUTATION_BONUS_FACTOR);
      await redis.hincrby(`worker:stats:${WORKER_FID}`, 'reputationScore', reputationGain);
      
      // Update success rate (simplified - in reality would track attempts vs successes)
      const attempts = await redis.hget(`worker:stats:${WORKER_FID}`, 'taskAttempts') || '0';
      const successes = await redis.hget(`worker:stats:${WORKER_FID}`, 'taskSuccesses') || '0';
      const newAttempts = parseInt(attempts) + 1;
      const newSuccesses = parseInt(successes) + (taskCompleted ? 1 : 0);
      
      await redis.hset(`worker:stats:${WORKER_FID}`, {
        taskAttempts: newAttempts.toString(),
        taskSuccesses: newSuccesses.toString()
      });
      
      // Calculate and store success rate
      const successRate = (newSuccesses / newAttempts) * 100;
      await redis.hset(`worker:stats:${WORKER_FID}`, 'successRate', successRate.toFixed(1));
    }
  } catch (e) {
    console.error('[auto-worker] updateWorkerStats error:', e);
  }
}

async function settleBounty(redis: any, bounty: any, result: string): Promise<boolean> {
  try {
    const rewardAmount = bounty.reward || bounty.rewardUsdc || 0;

    await redis.set(`bounty:${bounty.id}`, JSON.stringify({
      ...bounty,
      status: 'settled',
      resultUrl: result,
      paidAmountUsdc: rewardAmount,
      settledAt: Math.floor(Date.now() / 1000),
    }));

    // Update worker statistics
    await updateWorkerStats(redis, true, rewardAmount);

    console.log(`[auto-worker] Settled bounty ${bounty.id}`);
    return true;
  } catch (e) {
    console.error('[auto-worker] settleBounty error:', e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[auto-worker] Starting autonomous worker run');

  try {
    const redis = await getRedis();
    if (!redis) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }

    const groq = await getGroq();
    if (!groq) {
      console.log('[auto-worker] Warning: No Groq configured, running in limited mode');
    }

    const openBounties = await getOpenBounties(redis);
    const assignedBounties = await getAssignedBounties(redis);
    console.log(`[auto-worker] Found ${openBounties.length} open, ${assignedBounties.length} assigned bounty(ies)`);
    
    // Debug: Log details of open bounties
    if (openBounties.length > 0) {
      console.log(`[auto-worker] Open bounties details:`);
      openBounties.forEach((b, index) => {
        console.log(`  ${index+1}. ID: ${b.id}, Task: "${b.task}", Type: ${b.type}, Reward: ${b.reward}`);
      });
    }
    
    if (assignedBounties.length > 0) {
      console.log(`[auto-worker] Assigned bounties:`, assignedBounties.map(b => ({ 
        id: b.id, 
        workerFid: b.workerFid, 
        targetFid: WORKER_FID,
        status: b.status
      })));
    }

    const results = {
      evaluated: 0,
      bid: 0,
      skippedAlreadyBid: 0,
      executed: 0,
      settled: 0,
      errors: 0,
    };

    // Debug: capture open bounties found
    const openBountiesFound = await getOpenBounties(redis);
    const assignedBountiesFound = await getAssignedBounties(redis);
    console.log(`[auto-worker] Found ${openBountiesFound.length} open, ${assignedBountiesFound.length} assigned bounty(ies)`);
    
    // Debug: Log details of open bounties
    if (openBountiesFound.length > 0) {
      console.log(`[auto-worker] Open bounties details:`);
      openBountiesFound.forEach((b, index) => {
        console.log(`  ${index+1}. ID: ${b.id}, Task: "${b.task}", Type: ${b.type}, Reward: ${b.reward}, Status: ${b.status}`);
      });
    }
    
    if (assignedBountiesFound.length > 0) {
      console.log(`[auto-worker] Assigned bounties:`, assignedBountiesFound.map(b => ({ 
        id: b.id, 
        workerFid: b.workerFid, 
        targetFid: WORKER_FID,
        status: b.status
      })));
    }

      const shouldBid = await shouldBidOnBounty(bounty, groq);
      console.log(`[auto-worker] Should bid on ${bounty.id}: ${shouldBid}`);
      if (shouldBid) {
        const submitted = await submitBid(redis, bounty, groq);
        if (submitted) {
          results.bid++;
          console.log(`[auto-worker] Bid submitted for ${bounty.id}`);
          // Auto-accept our own bid if bounty is still open
          const bountyData = await redis.get(`bounty:${bounty.id}`);
          if (bountyData) {
            const bountyObj = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
            // If still open and we bid, auto-accept
            if (bountyObj.status === 'open') {
              const accepted = await acceptBid(redis, bounty.id, WORKER_FID, WORKER_USERNAME);
              if (accepted) {
                console.log(`[auto-worker] Auto-accepted bid for ${bounty.id}`);
              }
            }
          }
        } else {
          results.errors++;
        }
      } else {
        results.skippedAlreadyBid++;
        console.log(`[auto-worker] Skipped bidding on ${bounty.id}`);
      }
    }

    for (const bounty of assignedBounties) {
      if (bounty.workerFid === WORKER_FID) {
        console.log(`[auto-worker] Executing assigned bounty ${bounty.id}`);
        results.executed++;
        const result = await executeTask(bounty);
        await settleBounty(redis, bounty, result);
        results.settled++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[auto-worker] Completed in ${duration}ms`, results);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      results,
    });
  } catch (error) {
    console.error('[auto-worker] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

    const groq = await getGroq();
    if (!groq) {
      console.log('[auto-worker] Warning: No Groq configured, running in limited mode');
    }

    const openBounties = await getOpenBounties(redis);
    const assignedBounties = await getAssignedBounties(redis);
    console.log(`[auto-worker] Found ${openBounties.length} open, ${assignedBounties.length} assigned bounty(ies)`);
    
    if (assignedBounties.length > 0) {
      console.log(`[auto-worker] Assigned bounties:`, assignedBounties.map(b => ({ 
        id: b.id, 
        workerFid: b.workerFid, 
        targetFid: WORKER_FID,
        status: b.status
      })));
    }

    const results = {
      evaluated: 0,
      bid: 0,
      skippedAlreadyBid: 0,
      executed: 0,
      settled: 0,
      errors: 0,
    };

      for (const bounty of openBounties) {
        results.evaluated++;
        console.log(`[auto-worker] Evaluating bounty ${bounty.id}: "${bounty.task}"`);

        if (await alreadyBid(bounty.id, WORKER_FID)) {
          results.skippedAlreadyBid++;
          console.log(`[auto-worker] Already bid on ${bounty.id}, skipping`);
          continue;
        }

        const shouldBid = await shouldBidOnBounty(bounty, groq);
        console.log(`[auto-worker] Should bid on ${bounty.id}: ${shouldBid}`);
        if (shouldBid) {
          const submitted = await submitBid(redis, bounty, groq);
          if (submitted) {
            results.bid++;
            console.log(`[auto-worker] Bid submitted for ${bounty.id}`);
            // Auto-accept our own bid if bounty is still open
            const bountyData = await redis.get(`bounty:${bounty.id}`);
            if (bountyData) {
              const bountyObj = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
              // If still open and we bid, auto-accept
              if (bountyObj.status === 'open') {
                const accepted = await acceptBid(redis, bounty.id, WORKER_FID, WORKER_USERNAME);
                if (accepted) {
                  console.log(`[auto-worker] Auto-accepted bid for ${bounty.id}`);
                }
              }
            }
          } else {
            results.errors++;
          }
        } else {
          results.skippedAlreadyBid++;
          console.log(`[auto-worker] Skipped bidding on ${bounty.id}`);
        }
      }

    for (const bounty of assignedBounties) {
      if (bounty.workerFid === WORKER_FID) {
        console.log(`[auto-worker] Executing assigned bounty ${bounty.id}`);
        results.executed++;
        const result = await executeTask(bounty);
        await settleBounty(redis, bounty, result);
        results.settled++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[auto-worker] Completed in ${duration}ms`, results);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      results,
    });
  } catch (error) {
    console.error('[auto-worker] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    workerFid: WORKER_FID,
    workerUsername: WORKER_USERNAME,
    hasGroq: !!GROQ_API_KEY,
  });
}