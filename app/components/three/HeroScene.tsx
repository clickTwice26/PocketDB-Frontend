"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Animated connecting lines between nodes                            */
/* ------------------------------------------------------------------ */
function ConnectionLines({ positions }: { positions: [number, number, number][] }) {
  const linesRef = useRef<THREE.Group>(null);

  const connections = useMemo(() => {
    const conns: { from: number; to: number }[] = [];
    // Connect center to all others, and a few neighbor connections
    for (let i = 1; i < positions.length; i++) {
      conns.push({ from: 0, to: i });
    }
    // Extra connections for mesh feel
    conns.push({ from: 1, to: 2 });
    conns.push({ from: 2, to: 3 });
    conns.push({ from: 3, to: 4 });
    conns.push({ from: 4, to: 5 });
    conns.push({ from: 5, to: 1 });
    return conns;
  }, [positions.length]);

  useFrame(({ clock }) => {
    if (!linesRef.current) return;
    linesRef.current.children.forEach((child, i) => {
      const line = child as THREE.Line;
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = 0.12 + Math.sin(clock.elapsedTime * 1.5 + i * 0.8) * 0.08;
    });
  });

  const lineObjects = useMemo(() => {
    return connections.map(({ from, to }) => {
      const points = [
        new THREE.Vector3(...positions[from]),
        new THREE.Vector3(...positions[to]),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: "#6366f1",
        transparent: true,
        opacity: 0.15,
      });
      return new THREE.Line(geometry, material);
    });
  }, [connections, positions]);

  return (
    <group ref={linesRef}>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating data particle system                                      */
/* ------------------------------------------------------------------ */
function DataParticles({ count = 60 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      vel[i * 3] = (Math.random() - 0.5) * 0.008;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    }
    return [pos, vel];
  }, [count]);

  useFrame(() => {
    if (!ref.current) return;
    const posAttr = ref.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1];
      arr[i * 3 + 2] += velocities[i * 3 + 2];

      // Wrap around
      if (Math.abs(arr[i * 3]) > 6) velocities[i * 3] *= -1;
      if (Math.abs(arr[i * 3 + 1]) > 5) velocities[i * 3 + 1] *= -1;
      if (Math.abs(arr[i * 3 + 2]) > 4) velocities[i * 3 + 2] *= -1;
    }
    posAttr.needsUpdate = true;
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [positions]);

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color="#818cf8"
        size={0.03}
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Central glowing core sphere                                        */
/* ------------------------------------------------------------------ */
function CoreSphere() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.15;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.2;
  });

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <Sphere ref={ref} args={[0.6, 32, 32]} position={[0, 0, 0]}>
        <MeshDistortMaterial
          color="#6366f1"
          emissive="#4f46e5"
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.8}
          distort={0.15}
          speed={1.5}
          transparent
          opacity={0.85}
        />
      </Sphere>
    </Float>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting node spheres                                              */
/* ------------------------------------------------------------------ */
function OrbitNode({
  position,
  size = 0.2,
  color = "#818cf8",
  speed = 1,
  offset = 0,
}: {
  position: [number, number, number];
  size?: number;
  color?: string;
  speed?: number;
  offset?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const basePos = useRef(position);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + offset;
    ref.current.position.x = basePos.current[0] + Math.sin(t) * 0.3;
    ref.current.position.y = basePos.current[1] + Math.cos(t * 0.7) * 0.2;
    ref.current.position.z = basePos.current[2] + Math.sin(t * 0.5) * 0.15;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <Sphere ref={ref} args={[size, 16, 16]} position={position}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.7}
          transparent
          opacity={0.8}
        />
      </Sphere>
    </Float>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated ring                                                      */
/* ------------------------------------------------------------------ */
function OrbitRing({ radius = 2.5, tilt = 0 }: { radius?: number; tilt?: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = clock.elapsedTime * 0.05;
  });

  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.008, 16, 100]} />
      <meshBasicMaterial color="#6366f1" transparent opacity={0.12} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Mouse-reactive camera movement                                     */
/* ------------------------------------------------------------------ */
function CameraRig() {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  useFrame(() => {
    camera.position.x += (mouse.current.x * 0.5 - camera.position.x) * 0.02;
    camera.position.y += (mouse.current.y * 0.3 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Scene composition                                                  */
/* ------------------------------------------------------------------ */
function Scene() {
  const nodePositions: [number, number, number][] = [
    [0, 0, 0],       // center
    [2.2, 1.2, -0.5],
    [-2, 1.5, 0.3],
    [-2.5, -1, -0.8],
    [2.5, -1.3, 0.4],
    [0.3, 2.5, -0.3],
    [-0.5, -2.5, 0.5],
  ];

  const nodeColors = [
    "#6366f1", // center
    "#818cf8",
    "#a78bfa",
    "#22c55e",
    "#38bdf8",
    "#f472b6",
    "#fb923c",
  ];

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#818cf8" />
      <pointLight position={[-5, -3, 3]} intensity={0.4} color="#a78bfa" />
      <pointLight position={[0, 0, 3]} intensity={0.3} color="#6366f1" />

      <CameraRig />
      <CoreSphere />

      {nodePositions.slice(1).map((pos, i) => (
        <OrbitNode
          key={i}
          position={pos}
          size={0.12 + Math.random() * 0.1}
          color={nodeColors[i + 1]}
          speed={0.4 + Math.random() * 0.4}
          offset={i * 1.2}
        />
      ))}

      <ConnectionLines positions={nodePositions} />
      <DataParticles count={40} />

      <OrbitRing radius={2.8} tilt={Math.PI / 6} />
      <OrbitRing radius={3.5} tilt={-Math.PI / 8} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported HeroScene                                                 */
/* ------------------------------------------------------------------ */
export default function HeroScene() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        dpr={[1, 1]}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        style={{ pointerEvents: "none" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
