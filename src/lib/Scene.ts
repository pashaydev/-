import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

// Improved interfaces for better type safety
interface InteractiveObject {
	object: THREE.Object3D;
	originalScale: THREE.Vector3;
	currentScale: THREE.Vector3;
	targetScale: THREE.Vector3;
	lerpSpeed: number;
}

interface PetalData {
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	rotation: THREE.Euler;
	rotationSpeed: THREE.Vector3;
	scale: number;
	lifetime: number;
	maxLifetime: number;
	active: boolean;
	initialPhase: number;
}

export class Scene {
	public scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
	private gltfLoader: GLTFLoader;
	private dracoLoader: DRACOLoader;
	private clock: THREE.Clock;
	private animationMixers: THREE.AnimationMixer[] = [];

	// Raycasting properties
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private canvas: HTMLCanvasElement;

	// Model references
	private mainModel: THREE.Group | null = null;
	private ak74: THREE.Object3D | null = null;
	private grassVariants: THREE.Mesh[] = [];
	private plantVariants: THREE.Mesh[] = [];
	private grasses: InteractiveObject[] = [];

	// Interaction settings
	private interactionRadius = 2.5;
	private mouseIsActive = false;
	private mouseTimeout: ReturnType<typeof setTimeout> | null = null;
	private mouseMoveThrottle = false;

	// Particles
	private petalParticleSystem: THREE.InstancedMesh | null = null;
	private petalData: PetalData[] = [];
	private petalDummy = new THREE.Object3D();
	private readonly PETAL_COUNT = 100;
	private lastEmitTimes: Map<number, number> = new Map();
	private activeGrassCount = 0;
	private activePetalCount = 0;

	onLoadProgress?: (progress: number) => void;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.initScene();
		this.initCamera();
		this.initRenderer();
		this.initRaycaster();
		this.initLoaders();
		this.addLights();
		this.addEventListeners();
		this.animate();

		const wall = new THREE.Mesh(
			new THREE.PlaneGeometry(50, 50),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		wall.position.set(0, -2.5, -3);
		wall.castShadow = true;
		wall.receiveShadow = true;

		this.controls = new OrbitControls(this.camera, this.canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.minDistance = 2;
		this.controls.maxDistance = 10;
		this.controls.update();

		this.scene.add(wall);
	}

	private initScene(): void {
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color('black');
		this.clock = new THREE.Clock();
	}

	private initCamera(): void {
		this.camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);
		this.camera.position.set(0, 2, 5);
		this.camera.lookAt(0, 0, 0);
	}

	private initRenderer(): void {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		// shadows
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	}

	private initRaycaster(): void {
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
	}

	private initLoaders(): void {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

		this.gltfLoader = new GLTFLoader();
		this.gltfLoader.setDRACOLoader(this.dracoLoader);
	}

	private addEventListeners(): void {
		// Throttled mousemove for better performance
		this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
		window.addEventListener('resize', this.handleResize.bind(this));
	}

	private addLights(): void {
		// Ambient light for base illumination
		const ambientLight = new THREE.AmbientLight(new THREE.Color('white'), 0.6);
		this.scene.add(ambientLight);

		// Main directional light
		const mainLight = new THREE.DirectionalLight(new THREE.Color('white'), 1.2);
		mainLight.shadow.mapSize.width = 1024;
		mainLight.shadow.mapSize.height = 1024;
		mainLight.shadow.camera.near = 0.5;
		mainLight.shadow.camera.far = 500;
		mainLight.shadow.camera.left = -10;
		mainLight.shadow.camera.right = 10;
		mainLight.shadow.camera.top = 10;
		mainLight.shadow.camera.bottom = -10;
		mainLight.shadow.camera.updateProjectionMatrix();
		mainLight.position.set(0, 3, 5);
		mainLight.castShadow = true;
		this.scene.add(mainLight);

		// Fill light from opposite side
		const fillLight = new THREE.DirectionalLight(new THREE.Color('blue'), 0.5);
		fillLight.position.set(-5, 2, -5);
		this.scene.add(fillLight);
	}

	private onMouseMove(event: MouseEvent): void {
		// Skip if throttling is active
		if (this.mouseMoveThrottle) return;

		// Throttle mousemove events
		this.mouseMoveThrottle = true;
		setTimeout(() => {
			this.mouseMoveThrottle = false;
		}, 16); // ~60fps

		// Calculate mouse position in normalized device coordinates
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		// Set mouse as active
		this.mouseIsActive = true;

		// Reset timeout
		if (this.mouseTimeout) {
			clearTimeout(this.mouseTimeout);
		}

		// Set a short timeout to track when mouse stops moving
		this.mouseTimeout = setTimeout(() => {
			this.mouseIsActive = false;
		}, 250);
	}

	setInteractionRadius(radius: number): void {
		this.interactionRadius = radius;
	}

	loadModel(path: string): Promise<THREE.Group> {
		return new Promise((resolve, reject) => {
			this.gltfLoader.load(
				path,
				(gltf) => {
					const model = gltf.scene;
					model.position.y -= 2.5;
					model.rotateY(1.5);
					this.mainModel = model;
					this.scene.add(model);

					// Find AK74 component
					model.traverse((child) => {
						if (child.name.toLowerCase().includes('ak74')) {
							this.ak74 = child;
							this.ak74.rotation.y -= 0.1;
						}
						child.castShadow = true;
						child.receiveShadow = true;
					});

					if (this.ak74) {
						this.setupAk74Material();
					}

					// Cache mesh variants
					this.grassVariants = [];

					model.traverse((f) => (f.name.includes('flower') ? this.grassVariants.push(f) : null));

					this.plantVariants = model.children.filter((f) =>
						f.name.includes('plant')
					) as THREE.Mesh[];

					this.plantVariants.forEach((child) => {
						child.position.x += 100;
					});
					this.grassVariants.forEach((child) => {
						child.position.x += 100;
					});

					// Apply materials
					this.setupMeshMaterials();

					// Generate flora
					this.generateGrassOnModel('Ak74', 1000);
					this.initPetalParticleSystem();

					resolve(model);
				},
				(event) => {
					const percent = Math.floor((event.loaded / event.total) * 100);
					this.onLoadProgress?.(percent);
				},
				(error) => {
					console.error('Error loading model:', error);
					reject(error);
				}
			);
		});
	}

	private setupAk74Material(): void {
		if (!this.ak74) return;

		this.ak74.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.material = new THREE.MeshStandardMaterial({
					color: new THREE.Color('white'),
					metalness: 0.1,
					roughness: 0.9
				});
			}
		});
	}

	private setupMeshMaterials(): void {
		// Setup grass materials
		this.grassVariants.forEach((mesh) => {
			const mat = mesh.material as THREE.MeshStandardMaterial;
			mat.flatShading = true;
			mat.transparent = true;
			mat.opacity = 1;
			mat.roughness = 1.0;
			mat.metalness = 0;
		});

		// Setup plant materials
		this.plantVariants.forEach((mesh) => {
			const mat = mesh.material as THREE.MeshStandardMaterial;
			mat.transparent = true;
			mat.roughness = 0.5;
			mat.metalness = 0.5;
			mat.opacity = 1;
		});
	}

	private handleResize(): void {
		// Update camera
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		// Update renderer
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	}

	private animate(): void {
		requestAnimationFrame(this.animate.bind(this));

		const delta = this.clock.getDelta();
		const elapsedTime = this.clock.getElapsedTime();

		// Update grass animations
		if (this.grasses.length > 0) {
			this.updateGrass(delta, elapsedTime);
		}

		// Update petal particles
		if (this.activePetalCount > 0) {
			this.updatePetals(delta);
		}

		if (this.ak74) {
			const mouse = this.mouse;
			this.ak74.rotation.y = THREE.MathUtils.lerp(this.ak74.rotation.y, mouse.x * 0.1, delta * 10);
		}

		// Render the scene
		this.renderer.render(this.scene, this.camera);
	}

	dispose(): void {
		// Clean up event listeners
		this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
		window.removeEventListener('resize', this.handleResize.bind(this));

		// Clear any timeouts
		if (this.mouseTimeout) {
			clearTimeout(this.mouseTimeout);
		}

		// Dispose threejs resources
		this.renderer.dispose();
		this.dracoLoader.dispose();

		// Dispose materials and geometries
		if (this.petalParticleSystem) {
			this.petalParticleSystem.geometry.dispose();
			(this.petalParticleSystem.material as THREE.Material).dispose();
		}

		// Clean up the scene
		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose();

				if (Array.isArray(object.material)) {
					object.material.forEach((material) => material.dispose());
				} else {
					object.material.dispose();
				}
			}
		});
	}

	// Utility function to get random elements from array
	private getRandomElements<T>(array: T[], count: number): T[] {
		const shuffled = [...array].sort(() => 0.5 - Math.random());
		return shuffled.slice(0, count);
	}

	private updateGrass(delta: number, currentTime: number): void {
		// Skip updates if mouse is not active
		if (!this.mouseIsActive || !this.camera) {
			// Only apply slight movement to grass when mouse is inactive
			for (let i = 0; i < this.grasses.length; i++) {
				// const grass = this.grasses[i];
				// grass.object.rotation.y += (Math.random() - 0.5) * 0.001;
				// grass.object.rotation.z = Math.sin(currentTime + i * 0.1) * 0.005;
			}
			return;
		}

		// Calculate ray once
		this.raycaster.setFromCamera(this.mouse, this.camera);
		const ray = this.raycaster.ray.clone();

		// Update active grass
		this.activeGrassCount = 0;

		for (let i = 0; i < this.grasses.length; i++) {
			const grass = this.grasses[i];

			// Add slight movement to all grass
			grass.object.rotation.y += (Math.random() - 0.5) * 0.001;
			grass.object.rotation.z = Math.sin(currentTime + i * 0.1) * 0.005;

			// Check distance to ray
			const position = grass.object.position.clone();
			const distanceToRay = ray.distanceToPoint(position);

			if (distanceToRay < this.interactionRadius) {
				// Scale up when mouse is close
				const scaleFactor = 5.5 + (1 - distanceToRay / this.interactionRadius) * 5.5;
				grass.targetScale.copy(grass.originalScale).multiplyScalar(scaleFactor);

				// Emit petals if growing
				const lastEmitTime = this.lastEmitTimes.get(i) || 0;
				if (currentTime - lastEmitTime > 0.3) {
					// More petals bursting outward
					const petalCount = 5 + Math.floor(Math.random() * 7);

					// Emit from top of grass, adjusted for scale
					const emitPosition = position.clone();
					emitPosition.y += grass.currentScale.y * 0.1;

					this.emitPetals(emitPosition, petalCount);
					this.lastEmitTimes.set(i, currentTime);
				}

				this.activeGrassCount++;
			} else {
				// Reset to original scale
				grass.targetScale.copy(new THREE.Vector3(0, 0, 0));
			}

			// Smooth interpolation towards target scale
			grass.currentScale.lerp(grass.targetScale, grass.lerpSpeed);
			grass.object.scale.copy(grass.currentScale);
		}
	}

	public generateGrassOnModel(modelName: string = 'ak74', grassCount: number = 100): void {
		if (!this.mainModel) {
			console.warn('Main model not loaded yet. Cannot generate grass.');
			return;
		}

		// Find the specified model part
		let targetModel: THREE.Object3D | null = null;
		this.mainModel.traverse((child) => {
			if (child.name.toLowerCase().includes(modelName.toLowerCase())) {
				targetModel = child;
			}
		});

		if (!targetModel) {
			console.warn(`Could not find model part: ${modelName}`);
			return;
		}

		// Generate evenly distributed points on the model surface
		const points = this.generateEvenlyDistributedPoints(targetModel, grassCount * 2);
		if (points.length === 0) {
			console.warn('No points generated for grass placement');
			return;
		}

		// Filter points to use only those that face upward
		const upwardPoints = points.filter((point) => {
			const upVector = new THREE.Vector3(0, 1, 0);
			return point.normal.dot(upVector) > 0.4;
		});

		// Create a container for all grass
		const grassContainer = new THREE.Group();
		grassContainer.name = 'grassContainer';
		this.scene.add(grassContainer);

		// Use only the number of points we need
		const selectedPoints = this.getRandomElements(
			upwardPoints.length > grassCount ? upwardPoints : points,
			Math.min(grassCount, points.length)
		);

		// Create shared variables to avoid excessive object creation
		const tempQuat = new THREE.Quaternion();
		const upVector = new THREE.Vector3(0, 1, 0);

		// Create grass instances at each point
		selectedPoints.forEach(({ position, normal }) => {
			// Randomly choose a variant
			const variantIndex = Math.floor(Math.random() * this.grassVariants.length);
			const plantIndex = Math.floor(Math.random() * this.plantVariants.length);
			const variant = this.grassVariants[variantIndex];
			const plant = this.plantVariants[plantIndex];

			// Choose randomly between grass and plant
			const viewMesh = Math.random() > 0.5 ? plant.clone() : variant.clone();

			// Position grass at the point
			viewMesh.position.copy(position);

			// Random scale variation - smaller for more realistic look
			const scale = viewMesh.scale.x * 0.1 + Math.random() * 0.015;
			viewMesh.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);

			// Align grass with surface normal
			tempQuat.setFromUnitVectors(upVector, normal.normalize());
			viewMesh.quaternion.copy(tempQuat);

			// Add random rotation around the normal axis
			const randomAngle = Math.random() * Math.PI * 0.5;
			const randomRotation = new THREE.Quaternion();
			randomRotation.setFromAxisAngle(normal, randomAngle);
			viewMesh.quaternion.multiply(randomRotation);

			// Add slight random tilt
			viewMesh.rotation.z += (Math.random() - 0.5) * 0.3;

			// Add to grass container
			grassContainer.add(viewMesh);

			// Track in grasses array
			this.grasses.push({
				object: viewMesh,
				originalScale: viewMesh.scale.clone(),
				currentScale: viewMesh.scale.clone(),
				targetScale: viewMesh.scale.clone(),
				lerpSpeed: 0.05 + Math.random() * 0.01
			});
		});
	}

	private generateEvenlyDistributedPoints(
		object: THREE.Object3D,
		count: number
	): Array<{ position: THREE.Vector3; normal: THREE.Vector3 }> {
		// Geometry cache to avoid repeated computation
		const geometryCache = new Map<
			string,
			{
				triangles: Array<{
					points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
					normals: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
					area: number;
				}>;
				totalArea: number;
			}
		>();

		// Final points array
		const points: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }> = [];

		// Ensure world matrix is updated
		object.updateWorldMatrix(true, true);

		// First pass: collect all triangles and compute areas
		let allTriangles: Array<{
			points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
			normals: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
			area: number;
		}> = [];
		let totalArea = 0;

		object.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;

			const geometry = child.geometry;
			if (!geometry.index || !geometry.attributes.position) return;

			const cacheKey = child.uuid;

			// Check if we've already processed this geometry
			if (geometryCache.has(cacheKey)) {
				const cached = geometryCache.get(cacheKey)!;
				allTriangles = allTriangles.concat(cached.triangles);
				totalArea += cached.totalArea;
				return;
			}

			const triangles: typeof allTriangles = [];
			let meshTotalArea = 0;

			const positions = geometry.attributes.position;
			const normals = geometry.attributes.normal;
			const indices = geometry.index;
			const worldMatrix = child.matrixWorld;
			const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

			// Sample triangles to reduce computation if there are many
			const stride = positions.count > 10000 ? 3 : 1;

			for (let i = 0; i < indices.count; i += 3 * stride) {
				const idx1 = indices.getX(i);
				const idx2 = indices.getX(i + 1);
				const idx3 = indices.getX(i + 2);

				// Get vertices in world space
				const v1 = new THREE.Vector3()
					.fromBufferAttribute(positions, idx1)
					.applyMatrix4(worldMatrix);
				const v2 = new THREE.Vector3()
					.fromBufferAttribute(positions, idx2)
					.applyMatrix4(worldMatrix);
				const v3 = new THREE.Vector3()
					.fromBufferAttribute(positions, idx3)
					.applyMatrix4(worldMatrix);

				// Get normals in world space
				const n1 = new THREE.Vector3()
					.fromBufferAttribute(normals, idx1)
					.applyMatrix3(normalMatrix)
					.normalize();
				const n2 = new THREE.Vector3()
					.fromBufferAttribute(normals, idx2)
					.applyMatrix3(normalMatrix)
					.normalize();
				const n3 = new THREE.Vector3()
					.fromBufferAttribute(normals, idx3)
					.applyMatrix3(normalMatrix)
					.normalize();

				// Calculate triangle area
				const triangleArea = this.calculateTriangleArea(v1, v2, v3);

				triangles.push({
					points: [v1, v2, v3],
					normals: [n1, n2, n3],
					area: triangleArea
				});

				meshTotalArea += triangleArea;
			}

			// Cache computed triangles and area
			geometryCache.set(cacheKey, {
				triangles,
				totalArea: meshTotalArea
			});

			allTriangles = allTriangles.concat(triangles);
			totalArea += meshTotalArea;
		});

		if (allTriangles.length === 0) return [];

		// Second pass: distribute points based on triangle areas
		for (let i = 0; i < count; i++) {
			// Select a random triangle, weighted by area
			const randomValue = Math.random() * totalArea;
			let areaSum = 0;
			let selectedTriangle;

			for (const triangle of allTriangles) {
				areaSum += triangle.area;
				if (randomValue <= areaSum) {
					selectedTriangle = triangle;
					break;
				}
			}

			if (!selectedTriangle) {
				selectedTriangle = allTriangles[allTriangles.length - 1];
			}

			// Generate a random point on the selected triangle
			const { position, normal } = this.getRandomPointOnTriangle(
				selectedTriangle.points[0],
				selectedTriangle.points[1],
				selectedTriangle.points[2],
				selectedTriangle.normals[0],
				selectedTriangle.normals[1],
				selectedTriangle.normals[2]
			);

			points.push({ position, normal });
		}

		return points;
	}

	// Calculate the area of a triangle
	private calculateTriangleArea(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): number {
		// Use cross product for more efficient area calculation
		const side1 = new THREE.Vector3().subVectors(v2, v1);
		const side2 = new THREE.Vector3().subVectors(v3, v1);
		const cross = new THREE.Vector3().crossVectors(side1, side2);
		return cross.length() * 0.5;
	}

	// Generate a random point on a triangle with properly interpolated normal
	private getRandomPointOnTriangle(
		v1: THREE.Vector3,
		v2: THREE.Vector3,
		v3: THREE.Vector3,
		n1: THREE.Vector3,
		n2: THREE.Vector3,
		n3: THREE.Vector3
	): { position: THREE.Vector3; normal: THREE.Vector3 } {
		// Generate barycentric coordinates
		let r1 = Math.random();
		let r2 = Math.random();

		// Ensure r1 + r2 <= 1
		if (r1 + r2 > 1) {
			r1 = 1 - r1;
			r2 = 1 - r2;
		}

		const r3 = 1 - r1 - r2;

		// Create point using barycentric coordinates
		const position = new THREE.Vector3()
			.addScaledVector(v1, r1)
			.addScaledVector(v2, r2)
			.addScaledVector(v3, r3);

		// Interpolate normal
		const normal = new THREE.Vector3()
			.addScaledVector(n1, r1)
			.addScaledVector(n2, r2)
			.addScaledVector(n3, r3)
			.normalize();

		return { position, normal };
	}

	private initPetalParticleSystem(): void {
		if (this.petalParticleSystem) return;

		// Get a random flower material for petals
		const randomFlowerIndex = Math.floor(Math.random() * this.grassVariants.length);
		const flowerMesh = this.grassVariants[randomFlowerIndex];
		const petalGeometry = flowerMesh.geometry.clone().scale(4.2, 4.2, 4.2);

		// Clone and configure material
		const originalMat = flowerMesh.material as THREE.MeshStandardMaterial;
		const petalMaterial = originalMat.clone();
		petalMaterial.side = THREE.DoubleSide;
		petalMaterial.transparent = true;

		// Create instanced mesh for better performance
		this.petalParticleSystem = new THREE.InstancedMesh(
			petalGeometry,
			petalMaterial,
			this.PETAL_COUNT
		);
		this.petalParticleSystem.frustumCulled = false;

		// Initialize all petals as inactive
		for (let i = 0; i < this.PETAL_COUNT; i++) {
			this.petalData.push({
				position: new THREE.Vector3(),
				velocity: new THREE.Vector3(),
				rotation: new THREE.Euler(),
				rotationSpeed: new THREE.Vector3(
					(Math.random() - 0.5) * 0.05,
					(Math.random() - 0.5) * 0.05,
					(Math.random() - 0.5) * 0.05
				),
				scale: 0,
				lifetime: 0,
				maxLifetime: 0,
				active: false
			});

			// Set initial scale to 0 (invisible)
			this.petalDummy.scale.set(0, 0, 0);
			this.petalDummy.updateMatrix();
			this.petalParticleSystem.setMatrixAt(i, this.petalDummy.matrix);
		}

		this.petalParticleSystem.instanceMatrix.needsUpdate = true;
		this.scene.add(this.petalParticleSystem);
	}

	private emitPetals(position: THREE.Vector3, count: number): void {
		if (!this.petalParticleSystem) return;

		let emitted = 0;

		for (let i = 0; i < this.PETAL_COUNT && emitted < count; i++) {
			const petal = this.petalData[i];

			if (!petal.active) {
				// Position with slight randomness around source
				petal.position.copy(position);
				petal.position.x += (Math.random() - 0.5) * 0.1;
				petal.position.y += (Math.random() - 0.5) * 0.05;
				petal.position.z += (Math.random() - 0.5) * 0.1;

				// Calculate a random direction within a cone (shooting upward and outward)
				const spreadAngle = Math.PI / 3; // 60-degree cone
				const phi = Math.random() * 2 * Math.PI; // Random angle around Y axis
				const theta = Math.random() * spreadAngle; // Random angle from Y axis

				// Convert spherical to cartesian coordinates for direction
				const speed = 0.5 + Math.random() * 0.3; // Faster initial speed for "shooting" effect
				const dirX = Math.sin(theta) * Math.cos(phi);
				const dirY = Math.cos(theta); // Mainly upward
				const dirZ = Math.sin(theta) * Math.sin(phi);

				// Set velocity with the calculated direction (shooting outward)
				petal.velocity.set(dirX * speed, dirY * speed, dirZ * speed);

				// Random rotation
				petal.rotation.set(
					Math.random() * Math.PI * 2,
					Math.random() * Math.PI * 2,
					Math.random() * Math.PI * 2
				);

				// Faster spin for more dynamic movement
				petal.rotationSpeed.set(
					(Math.random() - 0.5) * 0.2,
					(Math.random() - 0.5) * 0.2,
					(Math.random() - 0.5) * 0.2
				);

				// Random size variation
				petal.scale = 0.05 + Math.random() * 0.05;

				// Set lifetime
				petal.maxLifetime = 2 + Math.random() * 3;
				petal.lifetime = petal.maxLifetime;

				// Track initial phase for motion patterns
				petal.initialPhase = Math.random() * Math.PI * 2;

				petal.active = true;
				emitted++;
				this.activePetalCount++;
			}
		}
	}

	private updatePetals(delta: number): void {
		if (!this.petalParticleSystem) return;

		let needsUpdate = false;
		this.activePetalCount = 0;

		// Temporary values to avoid creating new vectors in the loop
		const tempVelocity = new THREE.Vector3();
		const gravity = new THREE.Vector3(0, -0.15, 0); // Reduced gravity for more floating

		for (let i = 0; i < this.PETAL_COUNT; i++) {
			const petal = this.petalData[i];

			if (petal.active) {
				// Update lifetime
				petal.lifetime -= delta;

				if (petal.lifetime <= 0) {
					petal.active = false;
					petal.scale = 0;

					// Set scale to 0 for inactive petals
					this.petalDummy.scale.set(0, 0, 0);
					this.petalDummy.updateMatrix();
					this.petalParticleSystem.setMatrixAt(i, this.petalDummy.matrix);
					needsUpdate = true;
				} else {
					this.activePetalCount++;

					// Calculate life progress (0 = start, 1 = end)
					const lifeProgress = 1 - petal.lifetime / petal.maxLifetime;

					// Start with rapid movement, then gradually slow down
					const slowingFactor = Math.max(0.1, 1 - lifeProgress * 1.5);

					// Apply gravity more gradually as the petal ages
					tempVelocity.copy(gravity).multiplyScalar(lifeProgress * delta);
					petal.velocity.add(tempVelocity);

					// Add spiraling motion after initial burst
					if (lifeProgress > 0.3) {
						// Spiral effect using sine and cosine
						const spiralRadius = 0.02;
						const frequency = 2 + (i % 3); // Different frequencies for variety
						const time = performance.now() * 0.001 + petal.initialPhase;

						// Create a spiraling effect
						const spiralX = Math.cos(time * frequency) * spiralRadius;
						const spiralZ = Math.sin(time * frequency) * spiralRadius;

						tempVelocity.set(spiralX, 0, spiralZ);
						petal.velocity.add(tempVelocity);
					}

					// Update position based on velocity with slowing factor
					tempVelocity.copy(petal.velocity).multiplyScalar(delta * slowingFactor);
					petal.position.add(tempVelocity);

					// Add wind and swirling effect
					tempVelocity.set(
						(Math.random() - 0.5) * 0.005,
						(Math.random() - 0.5) * 0.002,
						(Math.random() - 0.5) * 0.005
					);
					petal.velocity.add(tempVelocity);

					// Update rotation for spinning/tumbling
					petal.rotation.x += petal.rotationSpeed.x * delta;
					petal.rotation.y += petal.rotationSpeed.y * delta;
					petal.rotation.z += petal.rotationSpeed.z * delta;

					// Fade out at end of life
					let scale = petal.scale;
					if (petal.lifetime < 0.5) {
						scale *= petal.lifetime * 2; // Fade out
					}

					// Update the instance matrix
					this.petalDummy.position.copy(petal.position);
					this.petalDummy.rotation.copy(petal.rotation);
					this.petalDummy.scale.set(scale, scale, scale);
					this.petalDummy.updateMatrix();
					this.petalParticleSystem.setMatrixAt(i, this.petalDummy.matrix);

					needsUpdate = true;
				}
			}
		}

		if (needsUpdate) {
			this.petalParticleSystem.instanceMatrix.needsUpdate = true;
		}
	}
}
