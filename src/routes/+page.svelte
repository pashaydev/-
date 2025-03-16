<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Scene } from '$lib/Scene';
	import { createPlaceholderModel } from '$lib/PlaceholderModel';
	import { fade } from 'svelte/transition';

	let canvas: HTMLCanvasElement;
	let scene: Scene;
	let modelLoaded = false;
	let loadingProgress = 0;

	onMount(() => {
		if (!canvas) return;

		// Initialize the scene
		scene = new Scene(canvas);
		scene.setInteractionRadius(2.75);
		scene.onLoadProgress = (progress) => {
			loadingProgress = progress;
		};

		// Load the model
		scene
			.loadModel('/models/ak.glb')
			.then(() => {
				modelLoaded = true;
			})
			.catch((error) => {
				console.error('Failed to load model:', error);
				// Fallback to placeholder model
				const placeholderModel = createPlaceholderModel();
				scene.scene.add(placeholderModel);
				modelLoaded = true;
			});
	});

	onDestroy(() => {
		// Clean up resources
		if (scene) {
			scene.dispose();
		}
	});
</script>

<svelte:head>
	<title>☮︎</title>
</svelte:head>

<div>
	<canvas bind:this={canvas}></canvas>

	{#if !modelLoaded}
		<div class="loading-overlay" transition:fade={{ duration: 300 }}>
			<p>Loading model...</p>

			<div class="progress-bar">
				<div class="progress" style="width: {loadingProgress}%"></div>
			</div>
		</div>
	{/if}
</div>

<style>
	.progress-bar {
		width: 100%;
		height: 10px;
		background-color: #f3f3f3;
		border-radius: 5px;
		overflow: hidden;
	}

	.progress {
		height: 100%;
		background-color: #4caf50;
		transition: width 0.3s ease-in-out;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100vh;
	}

	.loading-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		font-size: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* Override body background for better visual effect */
	:global(body) {
		background-color: #151515;
		color: white;
		margin: 0;
		overflow: hidden;
	}
</style>
