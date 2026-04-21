import { Jimp } from 'jimp';
import { join } from 'path';

const PUBLIC_DIR = join(process.cwd(), 'public');

async function resizeImage(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number
) {
  const image = await Jimp.read(inputPath);
  image.resize({ w: width, h: height });
  await image.write(outputPath as `${string}.${string}`);
  console.log(`Resized ${inputPath} -> ${outputPath} (${width}x${height})`);
}

async function main() {
  console.log('Resizing og-image to 3:2 ratio (1200x800)...\n');

  await resizeImage(
    join(PUBLIC_DIR, 'og-image.png'),
    join(PUBLIC_DIR, 'og-image.png'),
    1200,
    800
  );

  console.log('\nDone!');
}

main().catch(console.error);
