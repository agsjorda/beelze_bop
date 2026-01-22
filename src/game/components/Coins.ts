import { Scene } from "phaser";

export class Coins {
  public scene: Scene;
  private coins: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    this.coins = [];
  }

  preload(scene: Phaser.Scene) {
    this.scene = scene;

    scene.load.spritesheet('coin', 'assets/coin.png', {
      frameWidth: 85,
      frameHeight: 85,
    });
  }

  create(scene: Phaser.Scene) {
    scene.anims.create({
      key: 'flip',
      frames: scene.anims.generateFrameNumbers('coin', { start: 0, end: 9 }),
      frameRate: 15,
      repeat: -1
    });

    // for (let i = 0; i < 100; i++) {
    //   const x = Phaser.Math.Between(100, 700);
    //   const y = Phaser.Math.Between(100, 500);
    //   const coin = scene.physics.add.sprite(x, y, 'coin');
      
    //   coin.play('flip');
    //   coin.setVelocity(Phaser.Math.Between(-100, 100), 0);
  
    //   // Randomly flip horizontally or vertically
    //   coin.setFlipX(Math.random() > 0.5);
    //   coin.setFlipY(Math.random() > 0.5);
  
    //   // Random rotation (around Z axis in 2D)
    //   scene.tweens.add({
    //     targets: coin,
    //     angle: Phaser.Math.Between(-360, 360),
    //     duration: Phaser.Math.Between(1000, 3000),
    //     repeat: -1
    //   });
  
    //   // Optional: pulsating scale for some depth
    //   scene.tweens.add({
    //     targets: coin,
    //     scaleX: { from: 0.8, to: 1.2 },
    //     scaleY: { from: 0.8, to: 1.2 },
    //     yoyo: true,
    //     repeat: -1,
    //     duration: Phaser.Math.Between(800, 1600),
    //     ease: 'Sine.easeInOut',
    //     delay: Phaser.Math.Between(0, 500)
    //   });
    // }

    // scene.input.keyboard.on('keydown-SPACE', this.spawnCoin, this);
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown-SPACE', this.spawnCoin, this);
    }
  }

  spawnCoin(): void {
    const screenHeight = this.scene.scale.height as number;
    const x = this.scene.scale.width * 0.25;
    const y = screenHeight * 0.8;

    const coin = this.scene.physics.add.sprite(x, y, 'coin');
    
    coin.play('flip');
    const randomFrame = Phaser.Math.Between(0, 9);
    coin.setFrame(randomFrame);


    const velX = Phaser.Math.Between(500, 2000);
    const velY = Phaser.Math.Between(-5000, -1000);
    coin.setVelocity(velX, velY);
    coin.setFlipX(Math.random() > 0.5);
    coin.setFlipY(Math.random() > 0.5);

  }
}



/* TODO:
  - Make a fire and forget coins
  - Starting point
  - Direction
  - Applying physics by using force
*/

