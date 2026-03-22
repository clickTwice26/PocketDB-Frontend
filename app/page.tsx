"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase,
  faServer,
  faGaugeHigh,
  faShieldHalved,
  faTerminal,
  faCubes,
  faArrowRight,
  faPlay,
  faCircleNodes,
  faBolt,
  faChartLine,
  faCode,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import {
  faDocker,
} from "@fortawesome/free-brands-svg-icons";

/* ------------------------------------------------------------------ */
/*  Reusable animated wrapper — fades + slides children into view     */
/* ------------------------------------------------------------------ */
function FadeIn({
  children,
  delay = 0,
  direction = "up",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const dirMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...dirMap[direction] }}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating animated particles for the hero background               */
/* ------------------------------------------------------------------ */
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 200 + i * 120,
            height: 200 + i * 120,
            background: `radial-gradient(circle, rgb(var(--brand-500) / ${0.08 - i * 0.012}) 0%, transparent 70%)`,
            left: `${10 + i * 18}%`,
            top: `${5 + i * 12}%`,
          }}
          animate={{
            y: [0, -30 - i * 8, 0],
            x: [0, 15 + i * 5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 6 + i * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated grid background for hero                                 */
/* ------------------------------------------------------------------ */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.04]">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live dashboard mockup component                                    */
/* ------------------------------------------------------------------ */
function DashboardMockup() {
  const clusters = [
    { name: "prod-primary", type: "PostgreSQL 16", status: "running", nodes: 3, cpu: "12%", mem: "2.4 GB" },
    { name: "analytics-replica", type: "PostgreSQL 16", status: "running", nodes: 2, cpu: "8%", mem: "1.8 GB" },
    { name: "cache-cluster", type: "Redis 7", status: "running", nodes: 1, cpu: "3%", mem: "512 MB" },
    { name: "staging-db", type: "MySQL 8", status: "stopped", nodes: 1, cpu: "—", mem: "—" },
  ];

  return (
    <div className="relative rounded-2xl border border-surface-border bg-surface-50/80 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border bg-surface-50">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-fg-muted ml-2 font-mono">PocketDB — Dashboard</span>
      </div>

      {/* Sidebar + content */}
      <div className="flex min-h-[340px]">
        {/* Mini sidebar */}
        <div className="w-44 border-r border-surface-border bg-surface p-3 hidden sm:block">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <FontAwesomeIcon icon={faDatabase} className="text-white text-[10px]" />
            </div>
            <span className="text-xs font-semibold text-fg-strong">PocketDB</span>
          </div>
          {[
            { label: "Overview", active: false },
            { label: "Clusters", active: true },
            { label: "Nodes", active: false },
            { label: "Query Editor", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`text-[11px] py-1.5 px-2 rounded-md mb-0.5 ${
                item.active
                  ? "bg-brand-600/20 text-brand-400 font-medium"
                  : "text-fg-muted"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { label: "Total Clusters", value: "4" },
              { label: "Running Nodes", value: "7" },
              { label: "CPU Usage", value: "23%" },
              { label: "Memory", value: "4.7 GB" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.4 }}
                className="bg-surface-100 rounded-lg p-2.5 border border-surface-border"
              >
                <div className="text-[10px] text-fg-muted">{stat.label}</div>
                <div className="text-sm font-bold text-fg-strong">{stat.value}</div>
              </motion.div>
            ))}
          </div>

          {/* Cluster table */}
          <div className="rounded-lg border border-surface-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-surface-100 border-b border-surface-border">
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold">Cluster</th>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold hidden sm:table-cell">Engine</th>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold">Status</th>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold hidden md:table-cell">Nodes</th>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold hidden lg:table-cell">CPU</th>
                  <th className="text-left px-3 py-2 text-fg-muted font-semibold hidden lg:table-cell">Memory</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((c, i) => (
                  <motion.tr
                    key={c.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 + i * 0.1, duration: 0.35 }}
                    className="border-b border-surface-border last:border-0"
                  >
                    <td className="px-3 py-2 font-medium text-fg-strong">{c.name}</td>
                    <td className="px-3 py-2 text-fg-muted hidden sm:table-cell">{c.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          c.status === "running"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-slate-500/20 text-slate-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.status === "running" ? "bg-green-500" : "bg-slate-500"
                          }`}
                        />
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-fg-muted hidden md:table-cell">{c.nodes}</td>
                    <td className="px-3 py-2 text-fg-muted hidden lg:table-cell">{c.cpu}</td>
                    <td className="px-3 py-2 text-fg-muted hidden lg:table-cell">{c.mem}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Terminal demo component                                            */
/* ------------------------------------------------------------------ */
function TerminalDemo() {
  const lines = [
    { prompt: true, text: "pocketdb create --name prod-db --engine postgres:16 --nodes 3" },
    { prompt: false, text: "✓ Network 'prod-db-net' created" },
    { prompt: false, text: "✓ Node prod-db-1 (primary) started on port 5433" },
    { prompt: false, text: "✓ Node prod-db-2 (replica) started on port 5434" },
    { prompt: false, text: "✓ Node prod-db-3 (replica) started on port 5435" },
    { prompt: false, text: "✓ Cluster 'prod-db' is running with 3 nodes" },
  ];

  return (
    <div className="rounded-2xl border border-surface-border bg-surface overflow-hidden shadow-2xl shadow-black/30">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border bg-surface-50">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-fg-muted ml-2 font-mono">Terminal</span>
      </div>
      <div className="p-4 font-mono text-sm space-y-1">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.4 }}
          >
            {line.prompt ? (
              <span>
                <span className="text-brand-400">$</span>{" "}
                <span className="text-fg-strong">{line.text}</span>
              </span>
            ) : (
              <span className="text-green-400">{line.text}</span>
            )}
          </motion.div>
        ))}
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.5 }}
          className="inline-block"
        >
          <span className="text-brand-400">$</span>{" "}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-2 h-4 bg-brand-400 ml-0.5 translate-y-0.5"
          />
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature card                                                       */
/* ------------------------------------------------------------------ */
function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: typeof faDatabase;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <FadeIn delay={delay}>
      <div className="group relative bg-surface-50 border border-surface-border rounded-2xl p-6 transition-all duration-300 hover:border-brand-500/40 hover:shadow-xl hover:shadow-brand-500/5">
        <div className="w-12 h-12 rounded-xl bg-brand-600/15 border border-brand-500/25 flex items-center justify-center mb-4 group-hover:bg-brand-600/25 transition-colors duration-300">
          <FontAwesomeIcon icon={icon} className="text-brand-400 text-lg" />
        </div>
        <h3 className="text-base font-semibold text-fg-strong mb-2">{title}</h3>
        <p className="text-sm text-fg-muted leading-relaxed">{description}</p>
      </div>
    </FadeIn>
  );
}

/* ================================================================== */
/*  LANDING PAGE                                                       */
/* ================================================================== */
export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const features = [
    {
      icon: faCubes,
      title: "Multi-Engine Support",
      description: "Deploy PostgreSQL, MySQL, and Redis clusters from a unified interface. Mix and match engines for your stack.",
    },
    {
      icon: faCircleNodes,
      title: "Flexible Topologies",
      description: "Standalone, primary-replica, or multi-primary — configure the exact replication topology you need.",
    },
    {
      icon: faGaugeHigh,
      title: "Live Monitoring",
      description: "Real-time CPU, memory stats, and health checks for every node. Catch issues before they escalate.",
    },
    {
      icon: faTerminal,
      title: "Built-in Query Editor",
      description: "Execute SQL directly from the browser against any running cluster. Zero context-switching.",
    },
    {
      icon: faShieldHalved,
      title: "Resource Controls",
      description: "Set per-node CPU and memory limits. Docker-native isolation keeps your dev machine stable.",
    },
    {
      icon: faDocker,
      title: "Docker-Powered",
      description: "Every cluster runs in isolated Docker containers with dedicated networks and named volumes.",
    },
  ];

  const stats = [
    { value: "3", label: "Database Engines" },
    { value: "∞", label: "Clusters" },
    { value: "<30s", label: "Deploy Time" },
    { value: "100%", label: "Open Source" },
  ];

  return (
    <div className="min-h-screen overflow-hidden">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-surface-border/50 bg-surface/80 backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
            </div>
            <span className="text-lg font-bold text-fg-strong tracking-tight">PocketDB</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-fg-muted hover:text-fg-strong transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="btn-primary text-sm py-2 px-5"
            >
              Get Started
              <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero Section ───────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        <GridBackground />
        <FloatingOrbs />

        {/* Gradient glow behind hero */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-radial from-brand-500/20 via-brand-500/5 to-transparent" />
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10">
          <div className="max-w-7xl mx-auto px-6 text-center">
            {/* Badge */}
            <FadeIn>
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-600/10 border border-brand-500/20 mb-8"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-brand-400">
                  Open Source Database Cluster Manager
                </span>
              </motion.div>
            </FadeIn>

            {/* Heading */}
            <FadeIn delay={0.1}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-fg-strong tracking-tight leading-[1.1] mb-6">
                Spin up database
                <br />
                clusters in{" "}
                <span className="relative">
                  <span className="relative z-10 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 bg-clip-text text-transparent">
                    seconds
                  </span>
                  <motion.span
                    className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
                    style={{ originX: 0 }}
                  />
                </span>
              </h1>
            </FadeIn>

            {/* Subheading */}
            <FadeIn delay={0.2}>
              <p className="text-lg md:text-xl text-fg-muted max-w-2xl mx-auto mb-10 leading-relaxed">
                Docker-powered PostgreSQL, MySQL & Redis clusters with a sleek UI.
                Full lifecycle management, live monitoring, and a built-in query editor.
              </p>
            </FadeIn>

            {/* CTA Buttons */}
            <FadeIn delay={0.3}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register" className="btn-primary text-base py-3 px-8 shadow-lg shadow-brand-500/20">
                  <FontAwesomeIcon icon={faBolt} className="text-sm" />
                  Start for Free
                </Link>
                <a
                  href="#demo"
                  className="btn-secondary text-base py-3 px-8"
                >
                  <FontAwesomeIcon icon={faPlay} className="text-xs" />
                  See it in Action
                </a>
              </div>
            </FadeIn>

            {/* Stats */}
            <FadeIn delay={0.45}>
              <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mt-16">
                {stats.map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-fg-strong">{s.value}</div>
                    <div className="text-xs text-fg-muted mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </motion.div>
      </section>

      {/* ── Live Demo Section ──────────────────────────────────── */}
      <section id="demo" className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
              Live Preview
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-fg-strong mb-4">
              Your command center, reimagined
            </h2>
            <p className="text-fg-muted max-w-xl mx-auto">
              A clean, powerful dashboard to manage all your database clusters in one place.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="relative">
              {/* Glow behind the mockup */}
              <div className="absolute -inset-4 bg-gradient-radial from-brand-500/10 via-transparent to-transparent rounded-3xl blur-2xl pointer-events-none" />
              <DashboardMockup />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Features Grid ──────────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
              Features
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-fg-strong mb-4">
              Everything you need for local databases
            </h2>
            <p className="text-fg-muted max-w-xl mx-auto">
              Professional-grade cluster management without the ops complexity.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Terminal Demo ──────────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <FadeIn direction="right">
                <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
                  Developer Experience
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-fg-strong mb-4">
                  From zero to cluster in one command
                </h2>
                <p className="text-fg-muted mb-8 leading-relaxed">
                  Create multi-node database clusters with a single click — or use the API.
                  PocketDB handles networking, volumes, health checks, and resource limits automatically.
                </p>
                <ul className="space-y-3">
                  {[
                    "Dedicated Docker networks per cluster",
                    "Named volumes for data persistence",
                    "Configurable CPU & memory limits",
                    "Automatic health monitoring",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-fg-muted">
                      <span className="w-5 h-5 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-[9px]" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </FadeIn>
            </div>
            <FadeIn direction="left" delay={0.15}>
              <TerminalDemo />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────────── */}
      <section className="relative py-20 md:py-32 bg-surface-50/50 overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1.5" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <FadeIn className="text-center mb-20">
            <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
              How it Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-fg-strong mb-4">
              Three steps to production-like databases
            </h2>
            <p className="text-fg-muted max-w-lg mx-auto">
              Go from zero to a fully running cluster in under 30 seconds.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-10 relative">
            {/* Connector line between steps (desktop only) */}
            <div className="hidden md:block absolute top-[60px] left-[16%] right-[16%] h-px border-t border-dashed border-brand-500/20 pointer-events-none" />

            {[
              {
                step: "01",
                icon: faServer,
                title: "Configure Your Cluster",
                description:
                  "Choose your engine, topology, node count, and resource limits through an intuitive wizard.",
              },
              {
                step: "02",
                icon: faDocker,
                title: "Docker Does the Heavy Lifting",
                description:
                  "PocketDB provisions containers, creates networks, mounts volumes, and wires everything up.",
              },
              {
                step: "03",
                icon: faCode,
                title: "Query & Monitor",
                description:
                  "Use the built-in SQL editor, browse schemas, view real-time stats, and tail container logs.",
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 0.15}>
                <div className="relative group">
                  <div className="bg-surface-50 border border-surface-border rounded-2xl p-8 text-center transition-all duration-300 hover:border-brand-500/30 hover:shadow-xl hover:shadow-brand-500/5">
                    {/* Step badge */}
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600/10 border border-brand-500/25 text-xs font-bold text-brand-400 mb-5">
                      {item.step}
                    </div>

                    {/* Icon */}
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 3 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="w-16 h-16 rounded-2xl bg-brand-600/15 border border-brand-500/25 flex items-center justify-center mx-auto mb-6 group-hover:bg-brand-600/25 transition-colors duration-300"
                    >
                      <FontAwesomeIcon icon={item.icon} className="text-brand-400 text-2xl" />
                    </motion.div>

                    <h3 className="text-lg font-semibold text-fg-strong mb-3">{item.title}</h3>
                    <p className="text-sm text-fg-muted leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn>
            <div className="relative rounded-3xl border border-surface-border bg-surface-50 overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-radial from-brand-500/10 via-transparent to-transparent pointer-events-none" />

              <div className="relative z-10 py-16 md:py-24 px-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-brand-500/25"
                >
                  <FontAwesomeIcon icon={faDatabase} className="text-white text-2xl" />
                </motion.div>

                <h2 className="text-3xl md:text-4xl font-bold text-fg-strong mb-4">
                  Ready to simplify your database workflow?
                </h2>
                <p className="text-fg-muted max-w-lg mx-auto mb-8">
                  Stop wrestling with Docker commands. Get a beautiful interface to manage all your database clusters.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/register" className="btn-primary text-base py-3 px-8 shadow-lg shadow-brand-500/20">
                    <FontAwesomeIcon icon={faBolt} />
                    Get Started Now
                  </Link>
                  <Link href="/login" className="btn-secondary text-base py-3 px-8">
                    Sign In
                    <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-surface-border py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <FontAwesomeIcon icon={faDatabase} className="text-white text-xs" />
              </div>
              <span className="text-sm font-bold text-fg-strong">PocketDB</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="text-sm text-fg-muted hover:text-fg-strong transition-colors">
                Sign in
              </Link>
              <Link href="/register" className="text-sm text-fg-muted hover:text-fg-strong transition-colors">
                Get Started
              </Link>
            </div>
            <p className="text-xs text-fg-subtle">
              &copy; {new Date().getFullYear()} PocketDB. Open source under MIT.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
