import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const body = document.body;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9f6);
scene.fog = new THREE.Fog(0x87c9f6, 90, 560);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 950);
const player = {
  x: 0,
  y: 0.7,
  z: 220,
  yaw: 0,
  pitch: -0.28,
  speed: 13,
};

const worldState = {
  started: false,
  paused: false,
  cameraMode: 'third',
  flying: false,
  inCar: false,
  currentCar: null,
  inBoat: true,
  currentBoat: null,
};

const toastEl = document.getElementById('toast');
const statusBarEl = document.getElementById('status-bar');
const crosshairEl = document.getElementById('crosshair');
const pauseMenuEl = document.getElementById('pause-menu');
const resumeButtonEl = document.getElementById('resume-button');

const keys = {};
const cameraDirection = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const movement = new THREE.Vector3();

const clock = new THREE.Clock();

const ambient = new THREE.HemisphereLight(0xeaf8ff, 0x1b2c32, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4d6, 1.8);
sun.position.set(20, 30, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

const skyline = new THREE.Group();
scene.add(skyline);

const islandRadius = 320;
const seaLevel = -0.28;
const seaRadius = 800;
const streetWidth = 10;
const roadRadius = islandRadius - 40;
const streetSpacing = 72;
const gridExtent = Math.floor(roadRadius / streetSpacing) * streetSpacing;
const roadGridLines = [];
for (let coordinate = -gridExtent; coordinate <= gridExtent; coordinate += streetSpacing) {
  roadGridLines.push(coordinate);
}
const sea = new THREE.Mesh(
  new THREE.RingGeometry(islandRadius - 1, seaRadius, 128, 56),
  new THREE.MeshStandardMaterial({
    color: 0x1689bb,
    roughness: 0.24,
    metalness: 0.18,
    emissive: 0x073d68,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
  })
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = seaLevel;
sea.geometry.computeVertexNormals();
const seaBase = [];
const seaPositions = sea.geometry.attributes.position;
for (let i = 0; i < seaPositions.count; i += 1) {
  seaBase.push(seaPositions.getX(i), seaPositions.getY(i), seaPositions.getZ(i));
}
scene.add(sea);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(islandRadius, 120),
  new THREE.MeshStandardMaterial({
    color: 0x234937,
    roughness: 0.9,
    metalness: 0.05,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.15;
ground.receiveShadow = true;
scene.add(ground);

const beach = new THREE.Mesh(
  new THREE.RingGeometry(islandRadius - 25, islandRadius + 5, 144),
  new THREE.MeshStandardMaterial({ color: 0xd7c18d, roughness: 0.96, metalness: 0.02 })
);
beach.rotation.x = -Math.PI / 2;
beach.position.y = -0.08;
beach.receiveShadow = true;
scene.add(beach);

const islandShore = new THREE.Mesh(
  new THREE.RingGeometry(islandRadius - 1.2, islandRadius + 1.2, 128),
  new THREE.MeshStandardMaterial({
    color: 0xe9d9a8,
    roughness: 0.9,
    metalness: 0.05,
  })
);
islandShore.rotation.x = -Math.PI / 2;
islandShore.position.y = 0.04;
scene.add(islandShore);

function waterHeight(x, z, time = clock.elapsedTime) {
  return seaLevel + (Math.sin(x * 0.25 + time * 1.8) + Math.cos(z * 0.2 + time * 1.4)) * 0.24;
}

const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xc6c4b9, roughness: 0.96, metalness: 0.03 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x242b31, roughness: 0.8, metalness: 0.12 });
const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xf9ec9e, emissive: 0x8d7b25, emissiveIntensity: 0.2 });
const roadPositions = [];

function addRoad(x, z, width, depth) {
  const sidewalk = new THREE.Mesh(
    new THREE.BoxGeometry(width + 6, 0.1, depth + 6),
    sidewalkMaterial
  );
  sidewalk.position.set(x, 0.04, z);
  sidewalk.receiveShadow = true;
  scene.add(sidewalk);

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, depth),
    roadMaterial
  );
  road.position.set(x, 0.06, z);
  road.receiveShadow = true;
  scene.add(road);

  const lineGroup = new THREE.Group();
  const horizontal = width >= depth;
  const roadLength = horizontal ? width : depth;
  for (let i = -roadLength / 2 + 2; i <= roadLength / 2 - 2; i += 7) {
    const line = new THREE.Mesh(
      horizontal ? new THREE.BoxGeometry(2.5, 0.05, 0.7) : new THREE.BoxGeometry(0.7, 0.05, 2.5),
      lineMaterial
    );
    line.position.set(horizontal ? i : 0, 0.14, horizontal ? 0 : i);
    lineGroup.add(line);
  }
  lineGroup.position.set(x, 0, z);
  scene.add(lineGroup);
  roadPositions.push([x, z, width, depth]);
}

function addPerimeterRoad() {
  const segmentCount = 112;
  for (let i = 0; i < segmentCount; i += 1) {
    const startAngle = (i / segmentCount) * Math.PI * 2;
    const endAngle = ((i + 1) / segmentCount) * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(startAngle) * roadRadius, 0, Math.sin(startAngle) * roadRadius);
    const end = new THREE.Vector3(Math.cos(endAngle) * roadRadius, 0, Math.sin(endAngle) * roadRadius);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const length = start.distanceTo(end) + 0.8;
    const roadSegment = new THREE.Group();
    roadSegment.position.set(midpoint.x, 0, midpoint.z);
    roadSegment.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);

    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(length + 1, 0.1, streetWidth + 6),
      sidewalkMaterial
    );
    sidewalk.position.y = 0.04;
    sidewalk.receiveShadow = true;
    roadSegment.add(sidewalk);

    const road = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, streetWidth), roadMaterial);
    road.position.y = 0.06;
    road.receiveShadow = true;
    roadSegment.add(road);

    const marking = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.48, 0.05, 0.7),
      lineMaterial
    );
    marking.position.y = 0.14;
    roadSegment.add(marking);
    scene.add(roadSegment);
    roadPositions.push([midpoint.x, midpoint.z, length, streetWidth]);
  }
}

for (const coordinate of roadGridLines) {
  const halfLength = Math.sqrt(roadRadius ** 2 - coordinate ** 2);
  addRoad(coordinate, 0, streetWidth, halfLength * 2);
  addRoad(0, coordinate, halfLength * 2, streetWidth);
}
addPerimeterRoad();

const buildingGroup = new THREE.Group();
scene.add(buildingGroup);
const buildingMaterials = [
  0xd6d0c4, 0xc7d5d9, 0xd7c8b7, 0xb9c9c2, 0xe0d4c2, 0xb7c2d0,
].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
const houseMaterials = [
  0xf0dfbb, 0xe5c7a6, 0xd9d3be, 0xe9d8ca, 0xc9d9cf,
].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
const houseRoofMaterial = new THREE.MeshStandardMaterial({ color: 0x9c5140, roughness: 0.9 });
const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x83c9df,
  emissive: 0x17475b,
  emissiveIntensity: 0.22,
  roughness: 0.32,
  metalness: 0.12,
});
const buildingWindows = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1.5, 1.15, 0.12),
  windowMaterial,
  24000
);
const windowTransform = new THREE.Object3D();
let buildingWindowCount = 0;

function addBuildingWindow(x, y, z, rotationY) {
  if (buildingWindowCount >= buildingWindows.instanceMatrix.count) return;
  windowTransform.position.set(x, y, z);
  windowTransform.rotation.set(0, rotationY, 0);
  windowTransform.updateMatrix();
  buildingWindows.setMatrixAt(buildingWindowCount, windowTransform.matrix);
  buildingWindowCount += 1;
}

function addBuilding(x, z, width, depth, height, isHouse) {
  const wallMaterials = isHouse ? houseMaterials : buildingMaterials;
  const wallMaterial = wallMaterials[Math.floor(Math.random() * wallMaterials.length)];
  const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterial);
  building.position.set(x, height / 2 - 0.15, z);
  building.castShadow = true;
  building.receiveShadow = true;
  buildingGroup.add(building);

  if (isHouse) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.68, 2.8, 4), houseRoofMaterial);
    roof.position.set(x, height + 1.25, z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    buildingGroup.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.3, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x684a37, roughness: 0.9 })
    );
    door.position.set(x, 1.0, z + depth / 2 + 0.08);
    buildingGroup.add(door);
  } else {
    const roofline = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.8, 0.55, depth + 0.8),
      new THREE.MeshStandardMaterial({ color: 0x53656b, roughness: 0.78 })
    );
    roofline.position.set(x, height + 0.12, z);
    roofline.castShadow = true;
    buildingGroup.add(roofline);
  }

  const floors = Math.max(1, Math.floor((height - 2.8) / 4.2));
  const frontColumns = Math.max(2, Math.floor((width - 2) / 4.2));
  const sideColumns = Math.max(2, Math.floor((depth - 2) / 4.2));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = 2.7 + floor * 4.2;
    if (y > height - 1.5) continue;

    for (let column = 0; column < frontColumns; column += 1) {
      const xOffset = -width / 2 + (column + 1) * width / (frontColumns + 1);
      addBuildingWindow(x + xOffset, y, z + depth / 2 + 0.07, 0);
      addBuildingWindow(x + xOffset, y, z - depth / 2 - 0.07, Math.PI);
    }

    for (let column = 0; column < sideColumns; column += 1) {
      const zOffset = -depth / 2 + (column + 1) * depth / (sideColumns + 1);
      addBuildingWindow(x + width / 2 + 0.07, y, z + zOffset, Math.PI / 2);
      addBuildingWindow(x - width / 2 - 0.07, y, z + zOffset, -Math.PI / 2);
    }
  }
}

for (let x = -islandRadius + 48; x <= islandRadius - 48; x += 32) {
  for (let z = -islandRadius + 48; z <= islandRadius - 48; z += 32) {
    const buildingX = x + (Math.random() - 0.5) * 7;
    const buildingZ = z + (Math.random() - 0.5) * 7;
    const distanceToCenter = Math.hypot(buildingX, buildingZ);
    if (distanceToCenter > islandRadius - 33 || isNearRoad(buildingX, buildingZ, 17)) continue;

    const isHouse = distanceToCenter > islandRadius * 0.64 || Math.random() < 0.18;
    const width = isHouse ? 13 + Math.random() * 4 : 18 + Math.random() * 6;
    const depth = isHouse ? 13 + Math.random() * 4 : 18 + Math.random() * 6;
    let height;
    if (isHouse) {
      height = 4.8 + Math.random() * 3.2;
    } else if (distanceToCenter < islandRadius * 0.36) {
      height = 28 + Math.random() * 40;
    } else if (distanceToCenter < islandRadius * 0.68) {
      height = 13 + Math.random() * 19;
    } else {
      height = 8 + Math.random() * 9;
    }
    addBuilding(buildingX, buildingZ, width, depth, height, isHouse);
  }
}

buildingWindows.count = buildingWindowCount;
buildingWindows.instanceMatrix.needsUpdate = true;
buildingWindows.computeBoundingSphere();
scene.add(buildingWindows);

const cars = [];

function addTrafficCar(color, axis, fixedCoord, start, direction, laneOffset = 0) {
  const car = new THREE.Group();
  const wheels = [];
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fe5f5,
    roughness: 0.16,
    metalness: 0.18,
    transparent: true,
    opacity: 0.78,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17232c, roughness: 0.72 });
  const lights = new THREE.MeshStandardMaterial({ color: 0xfff0bb, emissive: 0xffcf6b, emissiveIntensity: 1.4 });
  const tailLights = new THREE.MeshStandardMaterial({ color: 0xff3852, emissive: 0x9f0016, emissiveIntensity: 0.9 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 4.3), paint);
  chassis.position.y = 0.72;
  car.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.82, 2.15), paint);
  cabin.position.set(0, 1.32, -0.05);
  car.add(cabin);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(1.83, 0.54, 2.02), glass);
  windows.position.set(0, 1.4, -0.03);
  car.add(windows);

  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.32, 16), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.12, 0.43, 1.35);
    car.add(wheel);
    wheels.push(wheel);
    const rearWheel = wheel.clone();
    rearWheel.position.z = -1.35;
    car.add(rearWheel);
    wheels.push(rearWheel);

    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lights);
    headlight.position.set(side * 0.73, 0.78, 2.18);
    car.add(headlight);
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.08), tailLights);
    tailLight.position.set(side * 0.76, 0.75, -2.18);
    car.add(tailLight);
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.16, 0.18), dark);
  bumper.position.set(0, 0.48, 2.2);
  car.add(bumper);
  const rearBumper = bumper.clone();
  rearBumper.position.z = -2.2;
  car.add(rearBumper);

  car.position.set(axis === 'x' ? start : fixedCoord, 0.12, axis === 'x' ? fixedCoord : start);
  car.rotation.y = axis === 'x' ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? 0 : Math.PI);
  car.traverse((part) => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  scene.add(car);

  cars.push({
    mesh: car,
    axis,
    fixedCoord,
    direction,
    speed: 10 + Math.random() * 5,
    min: -Math.sqrt(Math.max(0, roadRadius ** 2 - fixedCoord ** 2)) + 8,
    max: Math.sqrt(Math.max(0, roadRadius ** 2 - fixedCoord ** 2)) - 8,
    laneOffset,
    drive: 0,
    wheels,
  });
}

function spawnTraffic() {
  const colors = [0xff8c69, 0x63d2ff, 0xf5d76c, 0x7ef29a, 0x83aef5, 0xf4a261, 0x7aa6ff, 0xffa07a, 0xd8d2ff, 0x94d2bd];
  const trafficRows = [-144, -72, 0, 72, 144];
  trafficRows.forEach((z, index) => {
    const limit = Math.sqrt(roadRadius ** 2 - z ** 2) - 14;
    addTrafficCar(colors[index * 2], 'x', z, -limit, 1, 1.5);
    addTrafficCar(colors[index * 2 + 1], 'x', z, limit, -1, -1.5);
  });
}

const boats = [];

function addBoatNpc(boat) {
  const npc = new THREE.Group();
  const arms = [];
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.48, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf0a34a, roughness: 0.8 })
  );
  body.position.y = 0.92;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd89569, roughness: 0.8 })
  );
  head.position.y = 1.48;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x173b58, roughness: 0.85 })
  );
  cap.position.y = 1.55;
  npc.add(body, head, cap);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.3, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0a34a, roughness: 0.8 })
    );
    arm.position.set(side * 0.27, 0.95, 0);
    arm.rotation.z = side * -0.18;
    npc.add(arm);
    arms.push(arm);
  }
  npc.userData.arms = arms;
  npc.position.set(0, 0.58, 2.35);
  npc.traverse((part) => {
    if (part.isMesh) part.castShadow = true;
  });
  boat.add(npc);
  return npc;
}

function createBoat(color, x, z, options = {}) {
  const boat = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 4.8);
  hullShape.lineTo(1.55, 3.1);
  hullShape.lineTo(1.8, -3.2);
  hullShape.lineTo(1.2, -4.5);
  hullShape.lineTo(-1.2, -4.5);
  hullShape.lineTo(-1.8, -3.2);
  hullShape.lineTo(-1.55, 3.1);
  hullShape.closePath();

  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  hullGeometry.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(
    hullGeometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.28 })
  );
  hull.position.y = 0.55;
  boat.add(hull);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.18, 6.4),
    new THREE.MeshStandardMaterial({ color: 0xf0dfb8, roughness: 0.75 })
  );
  deck.position.set(0, 0.57, -0.15);
  boat.add(deck);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.15, 2.15),
    new THREE.MeshStandardMaterial({ color: 0xf3f4e9, roughness: 0.38 })
  );
  cabin.position.set(0, 1.18, -0.45);
  boat.add(cabin);
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.88, 0.55, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x68c8e8, roughness: 0.16, metalness: 0.12 })
  );
  windshield.position.set(0, 1.42, 0.64);
  boat.add(windshield);
  const sideWindowsMaterial = new THREE.MeshStandardMaterial({
    color: 0x72d0ed,
    roughness: 0.18,
    metalness: 0.12,
    transparent: true,
    opacity: 0.82,
  });
  for (const side of [-1, 1]) {
    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.45), sideWindowsMaterial);
    sideWindows.position.set(side * 0.94, 1.4, -0.48);
    boat.add(sideWindows);
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.16, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xfff4da, roughness: 0.35 })
  );
  roof.position.set(0, 1.82, -0.45);
  boat.add(roof);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f5ef, metalness: 0.35 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 4.3), railMaterial);
    rail.position.set(side * 1.48, 0.92, 0.05);
    boat.add(rail);
    const hullStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.16, 5.2),
      new THREE.MeshStandardMaterial({ color: 0xf3c85b, metalness: 0.18, roughness: 0.4 })
    );
    hullStripe.position.set(side * 1.7, 0.38, -0.1);
    boat.add(hullStripe);
  }

  const wakeMeshes = [];
  for (let i = 0; i < 2; i += 1) {
    const wake = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 28),
      new THREE.MeshBasicMaterial({ color: 0xb9f1ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, 0.06, -5.2 - i * 1.2);
    wake.visible = false;
    boat.add(wake);
    wakeMeshes.push(wake);
  }

  boat.traverse((part) => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  boat.position.set(x, waterHeight(x, z), z);
  boat.rotation.y = options.yaw ?? 0;
  const npc = options.ai ? addBoatNpc(boat) : null;
  scene.add(boat);

  const record = {
    mesh: boat,
    ai: options.ai ?? false,
    angle: options.angle ?? 0,
    radius: options.radius ?? Math.hypot(x, z),
    routeSpeed: options.routeSpeed ?? 0.035,
    drive: 0,
    yaw: boat.rotation.y,
    phase: Math.random() * Math.PI * 2,
    npc,
    wakeMeshes,
  };
  boats.push(record);
  return record;
}

const playerBoat = createBoat(0x087fa4, 0, islandRadius + 36, { yaw: Math.PI });
worldState.currentBoat = playerBoat;
player.yaw = playerBoat.yaw;
player.x = playerBoat.mesh.position.x;
player.z = playerBoat.mesh.position.z;
player.y = waterHeight(player.x, player.z) + 1.05;
createBoat(0xe9a33b, islandRadius + 65, 0, { ai: true, angle: 0, radius: islandRadius + 65, routeSpeed: 0.032 });
createBoat(0xf4f0e2, 0, -(islandRadius + 130), { ai: true, angle: -Math.PI / 2, radius: islandRadius + 130, routeSpeed: 0.027 });
createBoat(0x5bc4bd, -(islandRadius + 195), 0, { ai: true, angle: Math.PI, radius: islandRadius + 195, routeSpeed: 0.024 });
createBoat(0xec7260, 0, islandRadius + 250, { ai: true, angle: Math.PI / 2, radius: islandRadius + 250, routeSpeed: 0.021 });
spawnTraffic();
window.game = { worldState, player, cars, boats };

const avatar = new THREE.Group();
const avatarArms = [];
const avatarLegs = [];
const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd89569, roughness: 0.8 });
const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x1678a8, roughness: 0.65 });
const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x23364d, roughness: 0.82 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x18202a, roughness: 0.9 });
const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x30231d, roughness: 0.9 });

function addAvatarPart(geometry, material, x, y, z) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  avatar.add(part);
  return part;
}

addAvatarPart(new THREE.CapsuleGeometry(0.34, 0.72, 4, 8), shirtMaterial, 0, 1.1, 0);
addAvatarPart(new THREE.SphereGeometry(0.25, 16, 12), skinMaterial, 0, 1.82, 0);
addAvatarPart(new THREE.SphereGeometry(0.255, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMaterial, 0, 1.91, 0);
for (const side of [-1, 1]) {
  const arm = addAvatarPart(new THREE.CapsuleGeometry(0.12, 0.58, 4, 8), shirtMaterial, side * 0.44, 1.12, 0);
  arm.rotation.z = side * -0.12;
  avatarArms.push(arm);
  avatarLegs.push(addAvatarPart(new THREE.CapsuleGeometry(0.14, 0.58, 4, 8), pantsMaterial, side * 0.17, 0.43, 0));
  addAvatarPart(new THREE.BoxGeometry(0.28, 0.16, 0.42), shoeMaterial, side * 0.17, 0.08, 0.08);
}
scene.add(avatar);

function isNearRoad(x, z, margin = 7) {
  const nearGridRoad = roadGridLines.some((coordinate) => {
    const halfLength = Math.sqrt(roadRadius ** 2 - coordinate ** 2);
    const nearVertical = Math.abs(x - coordinate) < streetWidth / 2 + margin
      && Math.abs(z) < halfLength + margin;
    const nearHorizontal = Math.abs(z - coordinate) < streetWidth / 2 + margin
      && Math.abs(x) < halfLength + margin;
    return nearVertical || nearHorizontal;
  });
  return nearGridRoad || Math.abs(Math.hypot(x, z) - roadRadius) < streetWidth / 2 + margin;
}


function getStatusLabel() {
  if (worldState.paused) return 'Jogo pausado';
  if (worldState.inCar) return 'No carro — dirija pela cidade';
  if (worldState.inBoat) return 'No barco — explore o oceano';
  if (Math.hypot(player.x, player.z) > islandRadius) return 'Nadando — você está boiando no oceano';
  if (worldState.started) return 'Cidade em modo de exploração';
  return 'Cidade em espera';
}

function updateStatusBar() {
  statusBarEl.textContent = getStatusLabel();
}

const coordinatesEl = document.getElementById('coordinates');
let lastCoordinates = '';

function updateAvatarAndCoordinates() {
  const time = clock.elapsedTime;
  const inWater = !worldState.inBoat && !worldState.inCar && !worldState.flying
    && Math.hypot(player.x, player.z) > islandRadius;
  const walking = worldState.started && !worldState.inBoat && !worldState.inCar
    && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD
      || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight);
  const boatMoving = worldState.inBoat && worldState.currentBoat && Math.abs(worldState.currentBoat.drive) > 0.3;
  const moving = walking || boatMoving;
  const gait = Math.sin(time * (inWater ? 5 : 8));

  if (worldState.inBoat && worldState.currentBoat) {
    const boat = worldState.currentBoat;
    avatar.position.set(
      boat.mesh.position.x + Math.sin(boat.yaw) * 2.55,
      boat.mesh.position.y + 0.58 + Math.abs(Math.sin(time * 2.2 + boat.phase)) * 0.025,
      boat.mesh.position.z + Math.cos(boat.yaw) * 2.55
    );
    avatar.rotation.y = boat.yaw;
  } else {
    avatar.position.set(
      player.x,
      inWater ? waterHeight(player.x, player.z) - 0.88 : 0.03,
      player.z
    );
    avatar.rotation.y = player.yaw;
    if (walking) avatar.position.y += Math.abs(gait) * 0.055;
  }
  for (let i = 0; i < avatarArms.length; i += 1) {
    avatarArms[i].rotation.x = moving ? gait * (inWater ? 0.48 : 0.32) : Math.sin(time * 1.7 + i) * 0.025;
    avatarLegs[i].rotation.x = moving && !worldState.inBoat ? gait * 0.38 * (i === 0 ? 1 : -1) : 0;
  }
  avatar.visible = worldState.cameraMode === 'third' && !worldState.inCar;
  crosshairEl.style.visibility = worldState.cameraMode === 'first' ? 'visible' : 'hidden';

  const coordinates = `COORDENADAS · X ${Math.round(player.x)}  Y ${Math.round(player.y)}  Z ${Math.round(player.z)}`;
  if (coordinates !== lastCoordinates) {
    coordinatesEl.textContent = coordinates;
    lastCoordinates = coordinates;
  }
}

function toggleCameraView() {
  worldState.cameraMode = worldState.cameraMode === 'first' ? 'third' : 'first';
  const label = worldState.cameraMode === 'first' ? 'Primeira pessoa' : 'Terceira pessoa';
  toastEl.textContent = `Câmera: ${label}`;
  updateStatusBar();
}

function toggleFlightMode() {
  worldState.flying = !worldState.flying;
  toastEl.textContent = worldState.flying ? 'Modo voo ativado' : 'Modo voo desativado';
  updateStatusBar();
}

function updateCamera() {
  if (worldState.cameraMode === 'third') {
    const camOffset = new THREE.Vector3(
      -Math.sin(player.yaw) * 7,
      3.8,
      -Math.cos(player.yaw) * 7
    );
    camera.position.copy(new THREE.Vector3(player.x, player.y + 1.6, player.z)).add(camOffset);
    camera.lookAt(player.x + Math.sin(player.yaw) * 4, player.y + 1.4, player.z + Math.cos(player.yaw) * 4);
    return;
  }

  camera.position.set(player.x, player.y + 1.3, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function updateMovement(delta) {
  if (worldState.inCar && worldState.currentCar) {
    const car = worldState.currentCar;
    const accelerate = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);

    car.drive += accelerate * 18 * delta;
    car.drive = THREE.MathUtils.clamp(car.drive, -10, 22);

    const forwardSpeed = car.drive * delta;
    for (const wheel of car.wheels) {
      wheel.rotation.x -= car.drive * delta / 0.4;
    }
    if (car.axis === 'x') {
      car.mesh.position.x += car.direction * forwardSpeed;
      car.mesh.position.z = car.fixedCoord + car.laneOffset + steer * 0.8;
      car.mesh.rotation.y = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (car.mesh.position.x > car.max) car.mesh.position.x = car.min;
      if (car.mesh.position.x < car.min) car.mesh.position.x = car.max;
    } else {
      car.mesh.position.z += car.direction * forwardSpeed;
      car.mesh.position.x = car.fixedCoord + car.laneOffset + steer * 0.8;
      car.mesh.rotation.y = car.direction > 0 ? 0 : Math.PI;
      if (car.mesh.position.z > car.max) car.mesh.position.z = car.min;
      if (car.mesh.position.z < car.min) car.mesh.position.z = car.max;
    }

    player.x = car.mesh.position.x;
    player.z = car.mesh.position.z;
    player.y = 1.7;
    player.yaw = car.axis === 'x' ? (car.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.direction > 0 ? 0 : Math.PI);
    return;
  }

  if (worldState.inBoat && worldState.currentBoat) {
    const boat = worldState.currentBoat;
    const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    boat.drive += throttle * 8 * delta;
    if (throttle === 0) boat.drive *= Math.max(0, 1 - delta * 0.55);
    boat.drive = THREE.MathUtils.clamp(boat.drive, -7, 17);
    boat.yaw += steer * delta * Math.max(0.25, Math.abs(boat.drive) / 8) * (boat.drive < 0 ? -1 : 1);
    boat.mesh.position.x += Math.sin(boat.yaw) * boat.drive * delta;
    boat.mesh.position.z += Math.cos(boat.yaw) * boat.drive * delta;
    const boatDistance = Math.hypot(boat.mesh.position.x, boat.mesh.position.z);
    if (boatDistance < islandRadius + 5) {
      const angle = Math.atan2(boat.mesh.position.z, boat.mesh.position.x);
      boat.mesh.position.x = Math.cos(angle) * (islandRadius + 5);
      boat.mesh.position.z = Math.sin(angle) * (islandRadius + 5);
    } else if (boatDistance > seaRadius - 12) {
      const angle = Math.atan2(boat.mesh.position.z, boat.mesh.position.x);
      boat.mesh.position.x = Math.cos(angle) * (seaRadius - 12);
      boat.mesh.position.z = Math.sin(angle) * (seaRadius - 12);
    }
    boat.mesh.rotation.y = boat.yaw;
    player.x = boat.mesh.position.x;
    player.z = boat.mesh.position.z;
    player.y = waterHeight(player.x, player.z) + 1.05;
    player.yaw = boat.yaw;
    return;
  }

  const turnX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const turnZ = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);

  if (turnX !== 0 || turnZ !== 0) {
    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    movement.set(0, 0, 0);
    movement.addScaledVector(forward, turnZ);
    movement.addScaledVector(right, turnX);
    movement.normalize();
    const swimming = Math.hypot(player.x, player.z) > islandRadius - 2;
    const step = movement.multiplyScalar(player.speed * (swimming ? 0.42 : 1) * delta);
    player.x += step.x;
    player.z += step.z;
    const oceanLimit = seaRadius - 4;
    if (Math.hypot(player.x, player.z) > oceanLimit) {
      const angle = Math.atan2(player.z, player.x);
      player.x = Math.cos(angle) * oceanLimit;
      player.z = Math.sin(angle) * oceanLimit;
    }
  }

  if (worldState.flying) {
    if (keys.Space) {
      player.y += 9 * delta;
    }
    if (keys.ShiftLeft || keys.ShiftRight) {
      player.y -= 9 * delta;
    }
    player.y = THREE.MathUtils.clamp(player.y, 1.2, 18);
  } else if (Math.hypot(player.x, player.z) > islandRadius) {
    player.y = waterHeight(player.x, player.z) + 0.55;
  } else {
    player.y = 1.7;
  }
}

function updateWater(time) {
  for (let i = 0; i < seaPositions.count; i += 1) {
    const index = i * 3;
    const x = seaBase[index];
    const z = seaBase[index + 1];
    const wave = (Math.sin(x * 0.25 + time * 1.8) + Math.cos(z * 0.2 + time * 1.4)) * 0.24;
    seaPositions.setZ(i, seaBase[index + 2] + wave);
  }
  seaPositions.needsUpdate = true;
  sea.geometry.computeVertexNormals();
}

function togglePause(forceState) {
  const nextState = typeof forceState === 'boolean' ? forceState : !worldState.paused;
  worldState.paused = nextState;
  pauseMenuEl.classList.toggle('hidden', !worldState.paused);
  updateStatusBar();

  if (worldState.paused) {
    document.exitPointerLock?.();
    toastEl.textContent = 'Jogo pausado';
  } else {
    toastEl.textContent = worldState.started
      ? (worldState.inBoat ? 'No barco — WASD para navegar; L para sair' : 'Cidade ativa — explore a Baía 21')
      : 'Clique para entrar na cidade';
  }
}

function updateTraffic(time, delta) {
  for (const car of cars) {
    if (worldState.inCar && worldState.currentCar === car) {
      continue;
    }

    const drift = Math.sin(time * 2 + car.mesh.position.x * 0.4) * 0.08;
    if (car.axis === 'x') {
      car.mesh.position.x += car.direction * car.speed * delta;
      if (car.direction > 0 && car.mesh.position.x > car.max) {
        car.mesh.position.x = car.min;
      }
      if (car.direction < 0 && car.mesh.position.x < car.min) {
        car.mesh.position.x = car.max;
      }
      car.mesh.position.z = car.fixedCoord + car.laneOffset + drift;
      car.mesh.rotation.y = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.mesh.position.z += car.direction * car.speed * delta;
      if (car.direction > 0 && car.mesh.position.z > car.max) {
        car.mesh.position.z = car.min;
      }
      if (car.direction < 0 && car.mesh.position.z < car.min) {
        car.mesh.position.z = car.max;
      }
      car.mesh.position.x = car.fixedCoord + car.laneOffset + drift;
      car.mesh.rotation.y = car.direction > 0 ? 0 : Math.PI;
    }
    for (const wheel of car.wheels) {
      wheel.rotation.x -= car.direction * car.speed * delta / 0.4;
    }
  }
}

function updateBoats(time, delta) {
  for (const boat of boats) {
    if (boat.ai) {
      boat.angle += boat.routeSpeed * delta;
      const radius = boat.radius + Math.sin(time * 0.18 + boat.phase) * 2;
      boat.mesh.position.x = Math.cos(boat.angle) * radius;
      boat.mesh.position.z = Math.sin(boat.angle) * radius;
      boat.yaw = -boat.angle;
      boat.mesh.rotation.y = boat.yaw;
    }

    boat.mesh.position.y = waterHeight(boat.mesh.position.x, boat.mesh.position.z, time)
      + Math.sin(time * 2.2 + boat.phase) * 0.045;
    boat.mesh.rotation.x = Math.sin(time * 1.7 + boat.phase) * 0.025;
    boat.mesh.rotation.z = Math.cos(time * 1.3 + boat.phase) * 0.035;

    if (boat.npc) {
      const gesture = Math.sin(time * 2.4 + boat.phase) * 0.22;
      boat.npc.userData.arms[0].rotation.x = gesture;
      boat.npc.userData.arms[1].rotation.x = -gesture;
    }

    const moving = boat.ai || Math.abs(boat.drive) > 1;
    for (let i = 0; i < boat.wakeMeshes.length; i += 1) {
      const wake = boat.wakeMeshes[i];
      wake.visible = moving;
      if (moving) {
        const phase = (time * 0.48 + i * 0.5 + boat.phase) % 1;
        const scale = 0.8 + phase * 0.8;
        wake.scale.set(scale, scale, 1);
        wake.material.opacity = (1 - phase) * 0.2;
      }
    }
  }
}

function enterNearestVehicle() {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const car of cars) {
    const dx = player.x - car.mesh.position.x;
    const dz = player.z - car.mesh.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 7 && distance < nearestDistance) {
      nearest = { type: 'car', vehicle: car };
      nearestDistance = distance;
    }
  }

  for (const boat of boats) {
    const dx = player.x - boat.mesh.position.x;
    const dz = player.z - boat.mesh.position.z;
    const distance = Math.hypot(dx, dz);

    if (!boat.ai && boat === worldState.currentBoat) continue;
    if (distance < 9 && distance < nearestDistance) {
      nearest = { type: 'boat', vehicle: boat };
      nearestDistance = distance;
    }
  }

  if (!nearest) {
    toastEl.textContent = 'Nenhum veículo próximo';
    return;
  }

  if (nearest.type === 'car') {
    worldState.inBoat = false;
    worldState.currentBoat = null;
    worldState.inCar = true;
    worldState.currentCar = nearest.vehicle;
    player.x = nearest.vehicle.mesh.position.x;
    player.z = nearest.vehicle.mesh.position.z;
    player.y = 1.7;
    toastEl.textContent = 'Você entrou no carro';
  } else {
    worldState.inCar = false;
    worldState.currentCar = null;
    worldState.inBoat = true;
    worldState.currentBoat = nearest.vehicle;
    nearest.vehicle.ai = false;
    nearest.vehicle.drive = 0;
    if (nearest.vehicle.npc) nearest.vehicle.npc.visible = false;
    player.x = nearest.vehicle.mesh.position.x;
    player.z = nearest.vehicle.mesh.position.z;
    player.y = waterHeight(player.x, player.z) + 1.05;
    player.yaw = nearest.vehicle.yaw;
    toastEl.textContent = 'Você embarcou — W/A/S/D para navegar';
  }
  updateStatusBar();
}

function exitVehicle() {
  if (worldState.inCar && worldState.currentCar) {
    const car = worldState.currentCar;
    player.x = car.mesh.position.x + (car.axis === 'x' ? 3.5 * car.direction : 0);
    player.z = car.mesh.position.z + (car.axis === 'z' ? 3.5 * car.direction : 0);
    player.y = 1.7;
    worldState.inCar = false;
    worldState.currentCar = null;
    toastEl.textContent = 'Você saiu do carro';
  } else if (worldState.inBoat && worldState.currentBoat) {
    const boat = worldState.currentBoat;
    player.x = boat.mesh.position.x + Math.sin(boat.yaw + Math.PI / 2) * 4.5;
    player.z = boat.mesh.position.z + Math.cos(boat.yaw + Math.PI / 2) * 4.5;
    player.y = waterHeight(player.x, player.z) + 0.55;
    if (boat !== playerBoat) {
      boat.angle = Math.atan2(boat.mesh.position.z, boat.mesh.position.x);
      boat.radius = Math.hypot(boat.mesh.position.x, boat.mesh.position.z);
      boat.ai = true;
      if (boat.npc) boat.npc.visible = true;
    }
    worldState.inBoat = false;
    worldState.currentBoat = null;
    toastEl.textContent = 'Você saiu do barco — use WASD para nadar';
  }
  updateStatusBar();
}

function tick() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  if (!worldState.paused && worldState.started) {
    updateMovement(delta);
  }

  if (!worldState.paused) {
    updateTraffic(elapsed, delta);
    updateBoats(elapsed, delta);
  }

  updateAvatarAndCoordinates();
  updateCamera();
  updateWater(elapsed);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderer.domElement.addEventListener('click', () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  for (const code of Object.keys(keys)) keys[code] = false;
  worldState.started = document.pointerLockElement === renderer.domElement;
  toastEl.textContent = worldState.started
    ? (worldState.inBoat ? 'No barco — WASD para navegar; L para sair' : 'Cidade ativa — explore a Baía 21')
    : 'Clique para entrar na cidade';
  updateStatusBar();
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0018;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.2, 1.2);
});

document.addEventListener('keydown', (event) => {
  keys[event.code] = true;

  if (event.code === 'KeyF') {
    toggleCameraView();
    event.preventDefault();
  }

  if (event.code === 'Equal' || event.key === '=') {
    toggleFlightMode();
    event.preventDefault();
  }

  if (event.code === 'KeyR') {
    togglePause();
    event.preventDefault();
  }

  if (event.code === 'KeyL') {
    if (worldState.inCar || worldState.inBoat) {
      exitVehicle();
    } else {
      enterNearestVehicle();
    }
    event.preventDefault();
  }
});

document.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

window.addEventListener('blur', () => {
  for (const code of Object.keys(keys)) keys[code] = false;
});

resumeButtonEl.addEventListener('click', () => {
  togglePause(false);
  renderer.domElement.requestPointerLock?.();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateCamera();
updateStatusBar();
tick();
