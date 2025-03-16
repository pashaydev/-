import * as THREE from 'three';

export function createPlaceholderModel(): THREE.Group {
  const group = new THREE.Group();
  
  // Create a simple cube
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00,
    roughness: 0.5,
    metalness: 0.5
  });
  const cube = new THREE.Mesh(geometry, material);
  
  // Add the cube to the group
  group.add(cube);
  
  // For animation, we'll just set up the initial state
  // The Scene's animate loop will handle the actual animation
  
  // Add a method to update the cube each frame
  group.userData.update = (delta: number) => {
    cube.rotation.x += 0.5 * delta;
    cube.rotation.y += 0.5 * delta;
  };
  
  return group;
}