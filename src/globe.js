import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { LensFlareEffect } from "./LensFlare.js";

let scene, camera, renderer, controls;
let texture,
  geometry = {},
  material = {},
  mesh = {};
let earth, lensFlareEffect;

const guiControls = {
  simSpeed: 1,
};

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// Event listener for window resize
window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function loadTextures() {
  const textureLoader = new THREE.TextureLoader();
  const loadTexture = (url) =>
    new Promise((resolve, reject) => {
      textureLoader.load(url, resolve, undefined, reject);
    });

  try {
    texture = {
      earth: await loadTexture("textures/2_no_clouds_8k.jpg"),
      earthCityLights: await loadTexture("textures/cities_8k.png"),
      earthElevation: await loadTexture("textures/elev_bump_8k_modified.jpg"),
      earthClouds: await loadTexture("textures/fair_clouds_8k.jpg"),
      earthOceanMask: await loadTexture("textures/water_8k.png"),
      skydome: await loadTexture("textures/starmap_2020_8k.jpg"),
    };
  } catch (error) {
    console.error("Error loading textures:", error);
  }
}

function initObjectEarthBody() {
  // Define Earth geometry and material
  geometry.earthBody = new THREE.SphereGeometry(10, 128, 128);
  material.earthBody = new THREE.MeshStandardMaterial({
    map: texture.earth,
    bumpMap: texture.earthElevation,
    bumpScale: 0.05,
    emissiveMap: texture.earthCityLights,
    emissive: 0xffffcc,
    emissiveIntensity: 0.9,
    metalnessMap: texture.earthOceanMask,
    metalness: 0.5,
    roughness: 0.7,
  });

  // Modify Earth material shader for cloud shadows, city lights, atmospheric glow, and fresnel effect
  // Credit: https://github.com/franky-adl/threejs-earth
  material.earthBody.onBeforeCompile = function (shader) {
    shader.uniforms.tClouds = { value: texture.earthClouds };
    shader.uniforms.tClouds.value.wrapS = THREE.RepeatWrapping;
    shader.uniforms.uv_xOffset = { value: 0 };
    shader.fragmentShader = shader.fragmentShader.replace(
"#include <common>",
`
#include <common>
uniform sampler2D tClouds;
uniform float uv_xOffset;
`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
"#include <emissivemap_fragment>",
`
// Night lights effect
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
  emissiveColor *= 1.0 - smoothstep(-0.1, 0.0, dot(geometryNormal, directionalLights[0].direction));
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
// Cloud shadows effect
float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
diffuseColor.rgb *= max(1.0 - cloudsMapValue, 0.2 );
// Fresnel effect
float intensity = 1.6 - dot( geometryNormal, vec3( 0.0, 0.0, 1.0 ) );
vec3 atmosphere = vec3( 0.3, 0.6, 1.0 ) * pow(intensity, 5.0);
diffuseColor.rgb += atmosphere;
`
    );
    material.earthBody.userData.shader = shader;
  };

  // Define Earth mesh
  mesh.earthBody = new THREE.Mesh(geometry.earthBody, material.earthBody);
  mesh.earthBody.name = "earth-body";
}

function initObjectEarthClouds() {
  // Define Earth clouds geometry, material, and mesh
  geometry.earthClouds = new THREE.SphereGeometry(10.015, 128, 128);
  material.earthClouds = new THREE.MeshStandardMaterial({
    alphaMap: texture.earthClouds,
    transparent: true,
    depthWrite: false,
    bumpMap: texture.earthClouds,
    bumpScale: 0.01,
    side: THREE.DoubleSide,
  });
  mesh.earthClouds = new THREE.Mesh(geometry.earthClouds, material.earthClouds);
  mesh.earthClouds.name = "earth-clouds";
}

function initObjectEarthAtmosphere() {
  // Define Earth atmosphere geometry, material, and mesh
  geometry.earthAtmosphere = new THREE.SphereGeometry(12.5, 64, 64);
  material.earthAtmosphere = new THREE.ShaderMaterial({
    vertexShader: document.getElementById("vertexshader").textContent,
    fragmentShader: document.getElementById("fragmentshader").textContent,
    uniforms: {
      atmOpacity: { value: 0.3 },
      atmPowFactor: { value: 4.1 },
      atmMultiplier: { value: 9.5 },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    side: THREE.BackSide,
  });
  mesh.earthAtmosphere = new THREE.Mesh(
    geometry.earthAtmosphere,
    material.earthAtmosphere
  );
  mesh.earthAtmosphere.name = "earth-atmosphere";
}

function initObjectEarth() {
  // Initialize Earth objects
  initObjectEarthBody();
  initObjectEarthClouds();
  initObjectEarthAtmosphere();

  // Create Earth group, apply transformations, and add it to the scene
  earth = new THREE.Group();
  earth.add(mesh.earthBody);
  earth.add(mesh.earthClouds);
  earth.add(mesh.earthAtmosphere);
  earth.rotation.z = (23.5 / 360) * 2 * Math.PI; // Tilted on axis
  scene.add(earth);
}

function initObjectSkydome() {
  // Define skydome geometry and material
  geometry.skydome = new THREE.SphereGeometry(500, 32, 32);
  material.skydome = new THREE.MeshBasicMaterial({
    map: texture.skydome,
    side: THREE.BackSide,
  });

  // Create skydome mesh and add it to the scene
  mesh.skydome = new THREE.Mesh(geometry.skydome, material.skydome);
  mesh.skydome.userData = "no-occlusion";
  mesh.skydome.name = "skydome";

  scene.add(mesh.skydome);
}

function initObjects() {
  initObjectSkydome();
  initObjectEarth();
}

function initScene() {
  // Initialize the scene, camera, and renderer
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    90,
    window.innerWidth / window.innerHeight,
    0.1,
    500000
  );
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Position the camera
  camera.position.z = 15;

  // Directional (sun) light
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(-234810, 0, 0);
  scene.add(directionalLight);

  // Lens flare effect
  const lensFlare = LensFlareEffect({
    lensPosition: new THREE.Vector3(-234810, 0, 0),
    animated: false,
    additionalStreaks: false,
  });
  scene.add(lensFlare);

  return { scene, camera, renderer };
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Optional: enable damping for a smoother control experience
  controls.dampingFactor = 0.02; // Optional: set damping factor
}

function initGui() {
  const gui = new GUI();

  // TODO: Add controls to change scenes.
  gui.add(guiControls, "simSpeed", {
      Paused: 0,
      Normal: 1,
      "2x": 2,
      "4x": 4,
      "10x": 10,
      "50x": 50,
      "100x": 100,
      "500x": 500,
      "1000x": 1000,
      "10000x": 10000,
      "100000x": 100000,
    }).name("Simulation Speed");
}

// Animation loop
let previousTime = Date.now();
function animate() {
  requestAnimationFrame(animate);

  stats.begin();

  // Earth and cloud rotation
  const SIDEREAL_ROTATION_PERIOD = 86164.0905; // Sidereal day in seconds
  let currentTime = Date.now();
  let deltaTime = (currentTime - previousTime) / 1000; // Delta time in seconds
  let rotationSpeed =
    ((2 * Math.PI) / SIDEREAL_ROTATION_PERIOD) * guiControls.simSpeed;
  mesh.earthBody.rotation.y += rotationSpeed * deltaTime;
  mesh.earthClouds.rotation.y += rotationSpeed * 1.5 * deltaTime;

  // Calculate cloud shader UV offset
  const shader = mesh.earthBody.material.userData.shader;
  if (shader) {
    let offset = (rotationSpeed * 0.5 * deltaTime) / (2 * Math.PI);
    shader.uniforms.uv_xOffset.value += offset % 1;
  }

  // Update controls and skydome position, then render the scene
  controls.update();
  mesh.skydome.position.copy(camera.position);
  renderer.render(scene, camera);

  previousTime = currentTime;

  stats.end();
}

// Load textures and then initialize the scene
loadTextures().then(() => {
  ({ scene, camera, renderer } = initScene());
  initGui();
  initControls();
  initObjects();
  animate();
}).catch(error => {
    console.error("Failed to load textures:", error);
});
