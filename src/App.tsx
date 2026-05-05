import React, { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { Main } from './ui/Main';

/** React shell: `#app` fills `#root`; Phaser mounts in `#game-container`, UI in `.app-ui-layer`. See `docs/orientation-modal-porting-guide.md`. */
function App() {
	const [scene, setScene] = useState<Phaser.Scene | null>(null);
	const phaserRef = useRef<IRefPhaserGame | null>(null);

	const currentSceneHandler = (newScene: Phaser.Scene) => {
		setScene(newScene);
		console.log(`App currentScene: ${newScene.scene.key}`);
	};

	return (
		<div id="app">
			<PhaserGame ref={phaserRef} currentActiveScene={currentSceneHandler} />
			<div className="app-ui-layer">
				<Main currentScene={scene} />
			</div>
		</div>
	);
}

export default App;
