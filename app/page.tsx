"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import SmoothScroll from "@/components/SmoothScroll";

const HeroScene = dynamic(() => import("@/components/three/HeroScene"), {
  ssr: false,
  loading: () => null,
});
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
  faDiagramProject,
  faRocket,
  faBrain,
  faWandMagicSparkles,
  faSpinner,
  faRobot,
  faClockRotateLeft,
  faChevronDown,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { faDocker, faGithub } from "@fortawesome/free-brands-svg-icons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Reusable animated wrapper                                          */
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
      transition={{ duration: 0.7, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter                                                   */
/* ------------------------------------------------------------------ */
function AnimatedCounter({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const num = parseInt(value);
  const isNumber = !isNaN(num);
  const [display, setDisplay] = useState(isNumber ? "0" : value);

  useEffect(() => {
    if (!inView || !isNumber) return;
    let start = 0;
    const end = num;
    const duration = 1200;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * end);
      setDisplay(String(start));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, num, isNumber]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Typewriter text                                                    */
/* ------------------------------------------------------------------ */
function TypewriterText({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[index];
    const timeout = deleting ? 40 : 80;

    if (!deleting && displayed === word) {
      const pause = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(pause);
    }
    if (deleting && displayed === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % words.length);
      return;
    }

    const timer = setTimeout(() => {
      setDisplayed(
        deleting ? word.slice(0, displayed.length - 1) : word.slice(0, displayed.length + 1)
      );
    }, timeout);
    return () => clearTimeout(timer);
  }, [displayed, deleting, index, words]);

  return (
    <span className="relative">
      <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 bg-clip-text text-transparent">
        {displayed}
      </span>
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="inline-block w-[3px] h-[0.85em] bg-brand-400 ml-1 translate-y-[0.1em] rounded-full"
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero background — Three.js scene + CSS gradient fallback           */
/* ------------------------------------------------------------------ */
function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Three.js 3D scene */}
      <Suspense fallback={null}>
        <div className="absolute inset-0 opacity-70">
          <HeroScene />
        </div>
      </Suspense>

      {/* Static gradient orbs — no continuous animation to avoid GPU thrash */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[140px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-500)), transparent 70%)",
          top: "-15%",
          left: "10%",
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-[120px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-400)), transparent 70%)",
          top: "10%",
          right: "5%",
        }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      {/* Bottom radial fade into page background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,transparent_30%,var(--bg)_100%)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Spotlight card — follows cursor                                    */
/* ------------------------------------------------------------------ */
function SpotlightCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouse = useCallback(
    (e: React.MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY]
  );

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      className={`group relative overflow-hidden rounded-2xl border border-surface-border bg-surface-50 transition-all duration-300 hover:border-brand-500/40 ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px circle at ${mouseX}px ${mouseY}px, rgb(var(--brand-500) / 0.1), transparent 60%)`,
        }}
      />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating badge chips                                               */
/* ------------------------------------------------------------------ */
function FloatingChip({
  children,
  delay,
  x,
  y,
}: {
  children: React.ReactNode;
  delay: number;
  x: string;
  y: string;
}) {
  return (
    <motion.div
      className="absolute hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-50/90 backdrop-blur-md border border-surface-border shadow-lg text-xs font-medium text-fg-muted z-20"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, delay: delay * 2, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live dashboard mockup                                              */
/* ------------------------------------------------------------------ */
function DashboardMockup() {
  const clusters = [
    { name: "prod-primary", type: "PostgreSQL 16", status: "running", nodes: 3, cpu: "12%", mem: "2.4 GB" },
    { name: "analytics-replica", type: "PostgreSQL 16", status: "running", nodes: 2, cpu: "8%", mem: "1.8 GB" },
    { name: "cache-cluster", type: "Redis 7", status: "running", nodes: 1, cpu: "3%", mem: "512 MB" },
    { name: "staging-db", type: "MySQL 8", status: "stopped", nodes: 1, cpu: "—", mem: "—" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
      className="relative rounded-2xl border border-surface-border bg-surface-50/80 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden"
    >
      {/* Animated border shimmer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-[1px] -left-1/2 w-[200%] h-[2px] bg-gradient-to-r from-transparent via-brand-400/60 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
        />
      </div>

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
            { label: "ERD Generator", active: false },
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
              { label: "Total Clusters", value: "4", color: "text-brand-400" },
              { label: "Running Nodes", value: "7", color: "text-green-400" },
              { label: "CPU Usage", value: "23%", color: "text-yellow-400" },
              { label: "Memory", value: "4.7 GB", color: "text-blue-400" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.4 }}
                className="bg-surface-100 rounded-lg p-2.5 border border-surface-border"
              >
                <div className="text-[10px] text-fg-muted">{stat.label}</div>
                <div className={`text-sm font-bold ${stat.color}`}>{stat.value}</div>
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
                    className="border-b border-surface-border last:border-0 hover:bg-surface-100/50 transition-colors"
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
                            c.status === "running" ? "bg-green-500 animate-pulse" : "bg-slate-500"
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
    </motion.div>
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
      <div className="p-5 font-mono text-sm space-y-1.5">
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
/*  Bento feature card                                                 */
/* ------------------------------------------------------------------ */
function BentoCard({
  icon,
  title,
  description,
  delay,
  span = false,
}: {
  icon: typeof faDatabase;
  title: string;
  description: string;
  delay: number;
  span?: boolean;
}) {
  return (
    <FadeIn delay={delay} className={span ? "sm:col-span-2 lg:col-span-1" : ""}>
      <SpotlightCard className="h-full">
        <div className="relative p-6 h-full">
          <div className="w-11 h-11 rounded-xl bg-brand-600/15 border border-brand-500/25 flex items-center justify-center mb-4 group-hover:bg-brand-600/25 group-hover:scale-110 transition-all duration-300">
            <FontAwesomeIcon icon={icon} className="text-brand-400 text-base" />
          </div>
          <h3 className="text-[15px] font-semibold text-fg-strong mb-2">{title}</h3>
          <p className="text-sm text-fg-muted leading-relaxed">{description}</p>
        </div>
      </SpotlightCard>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee / infinite scroll for engine logos                         */
/* ------------------------------------------------------------------ */
function EngineMarquee() {
  const engines = [
    { name: "PostgreSQL", icon: faDatabase, color: "text-blue-400" },
    { name: "MySQL", icon: faDatabase, color: "text-orange-400" },
    { name: "Redis", icon: faDatabase, color: "text-red-400" },
    { name: "Docker", icon: faDocker, color: "text-blue-400" },
    { name: "SQL Editor", icon: faTerminal, color: "text-green-400" },
    { name: "ERD Generator", icon: faDiagramProject, color: "text-purple-400" },
    { name: "AI Assistant", icon: faBrain, color: "text-pink-400" },
    { name: "Live Monitoring", icon: faChartLine, color: "text-yellow-400" },
  ];

  const doubled = [...engines, ...engines];

  return (
    <div className="relative overflow-hidden py-6">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[var(--bg)] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[var(--bg)] to-transparent z-10" />

      <motion.div
        className="flex gap-6"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-surface-50 border border-surface-border whitespace-nowrap text-sm"
          >
            <FontAwesomeIcon icon={e.icon} className={`${e.color} text-xs`} />
            <span className="text-fg-muted font-medium">{e.name}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  Query Editor Live Demo                                             */
/* ================================================================== */

function renderSQLLine(line: string) {
  if (!line.trim()) return "\u00a0";
  const re =
    /\b(SELECT|FROM|WHERE|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|AS|COUNT|SUM|AVG|MIN|MAX|FILTER|INTERVAL|AND|OR|NOT|IN|LIKE|DISTINCT|UPDATE|SET|INSERT|INTO|VALUES|DELETE|TRUNCATE|CREATE|DROP|ALTER|TABLE|INDEX|RETURNING|NOW)\b/gi;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last)
      parts.push(<span key={`t${last}`} className="text-slate-300">{line.slice(last, m.index)}</span>);
    parts.push(<span key={`k${m.index}`} className="text-blue-400 font-semibold">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length)
    parts.push(<span key={`t${last}`} className="text-slate-300">{line.slice(last)}</span>);
  return parts.length > 0 ? <>{parts}</> : <span className="text-slate-300">{line}</span>;
}

const QE_DEMOS = [
  {
    label: "Users",
    sql: [
      "SELECT id, name, email, role,",
      "       created_at",
      "FROM   users",
      "LIMIT  5;",
    ],
    columns: ["id", "name", "email", "role", "created_at"],
    rows: [
      ["1", "Alice Johnson",  "alice@example.com",  "admin",      "2024-01-15"],
      ["2", "Bob Smith",      "bob@example.com",    "subscriber", "2024-02-20"],
      ["3", "Carol White",    "carol@example.com",  "normal",     "2024-03-10"],
      ["4", "David Brown",    "david@example.com",  "subscriber", "2024-03-22"],
      ["5", "Eve Davis",      "eve@example.com",    "normal",     "2024-04-01"],
    ],
    execMs: 4,
  },
  {
    label: "Analytics",
    sql: [
      "SELECT   role,",
      "         COUNT(*)               AS total,",
      "         COUNT(*) FILTER (",
      "           WHERE created_at >",
      "                 NOW() - INTERVAL '30 days'",
      "         )                      AS new_users",
      "FROM     users",
      "GROUP BY role",
      "ORDER BY total DESC;",
    ],
    columns: ["role", "total", "new_users"],
    rows: [
      ["normal",     "183", "34"],
      ["subscriber", "47",  "11"],
      ["admin",      "12",  "2"],
    ],
    execMs: 7,
  },
  {
    label: "Top Products",
    sql: [
      "SELECT   p.name, p.price,",
      "         c.name           AS category,",
      "         COUNT(oi.id)     AS orders",
      "FROM     products   p",
      "  JOIN   categories c",
      "         ON c.id = p.category_id",
      "  LEFT JOIN order_items oi",
      "         ON oi.product_id = p.id",
      "GROUP BY p.id, p.name, p.price, c.name",
      "ORDER BY orders DESC",
      "LIMIT    5;",
    ],
    columns: ["name", "price", "category", "orders"],
    rows: [
      ["Wireless Headphones", "$89.99",  "Electronics", "234"],
      ["Running Shoes",       "$149.00", "Sports",      "187"],
      ["Coffee Maker",        "$59.99",  "Kitchen",     "156"],
      ["Yoga Mat",            "$35.00",  "Sports",      "134"],
      ["Desk Lamp",           "$29.99",  "Home",        "121"],
    ],
    execMs: 12,
  },
];

const QE_SCHEMA = [
  { name: "users",       cols: ["id", "name", "email", "role", "created_at"],        pk: "id" },
  { name: "products",    cols: ["id", "name", "price", "category_id", "stock"],       pk: "id" },
  { name: "categories",  cols: ["id", "name", "description"],                         pk: "id" },
  { name: "orders",      cols: ["id", "user_id", "total", "status", "created_at"],    pk: "id" },
  { name: "order_items", cols: ["id", "order_id", "product_id", "quantity", "price"], pk: "id" },
];

function QueryEditorDemo() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [runKey, setRunKey]       = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult]       = useState(QE_DEMOS[0]);
  const [activeTab, setActiveTab] = useState<"output" | "browse">("output");
  const [expanded, setExpanded]   = useState<string | null>("users");

  // AI simulation state
  const AI_PROMPTS = [
    {
      question: "Show top 5 products by order count",
      answer: "Here's a query that joins products with order counts:",
      sql: `SELECT p.name, p.price,\n  COUNT(oi.id) AS orders\nFROM products p\nLEFT JOIN order_items oi\n  ON oi.product_id = p.id\nGROUP BY p.id\nORDER BY orders DESC\nLIMIT 5;`,
    },
    {
      question: "Find users who registered this month",
      answer: "Use DATE_TRUNC to filter by the current month:",
      sql: `SELECT id, name, email, role\nFROM users\nWHERE created_at >= DATE_TRUNC('month', NOW())\nORDER BY created_at DESC;`,
    },
    {
      question: "Count orders per user with total revenue",
      answer: "Join users with orders and aggregate the totals:",
      sql: `SELECT u.name, u.email,\n  COUNT(o.id)    AS order_count,\n  SUM(o.total)   AS revenue\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id, u.name, u.email\nORDER BY revenue DESC NULLS LAST;`,
    },
  ];
  const [aiStep, setAiStep]       = useState(0);  // which prompt/answer pair
  const [aiPhase, setAiPhase]     = useState<"typing-q" | "thinking" | "typing-a" | "done">("typing-q");
  const [aiQDisplayed, setAiQDisplayed] = useState("");
  const [aiADisplayed, setAiADisplayed] = useState("");

  const demo = QE_DEMOS[activeIdx];
  const aiPrompt = AI_PROMPTS[aiStep];

  // Typewriter-cycle simulation
  useEffect(() => {
    let cancelled = false;

    async function runCycle() {
      // Phase 1: type the question
      setAiPhase("typing-q");
      setAiQDisplayed("");
      setAiADisplayed("");
      const q = aiPrompt.question;
      for (let i = 1; i <= q.length; i++) {
        if (cancelled) return;
        setAiQDisplayed(q.slice(0, i));
        await new Promise((r) => setTimeout(r, 38));
      }
      if (cancelled) return;

      // Phase 2: thinking dots
      setAiPhase("thinking");
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;

      // Phase 3: type the answer text
      setAiPhase("typing-a");
      const a = aiPrompt.answer;
      for (let i = 1; i <= a.length; i++) {
        if (cancelled) return;
        setAiADisplayed(a.slice(0, i));
        await new Promise((r) => setTimeout(r, 22));
      }
      if (cancelled) return;

      // Phase 4: show sql + pause
      setAiPhase("done");
      await new Promise((r) => setTimeout(r, 3200));
      if (cancelled) return;

      // Next prompt
      setAiStep((s) => (s + 1) % AI_PROMPTS.length);
    }

    runCycle();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiStep]);

  const handleRun = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setActiveTab("output");
    setTimeout(() => {
      setResult(QE_DEMOS[activeIdx]);
      setRunKey((k) => k + 1);
      setIsRunning(false);
    }, 850);
  }, [activeIdx, isRunning]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
      className="relative rounded-2xl border border-surface-border bg-surface-50/80 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden"
    >
      {/* animated top shimmer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
        <motion.div
          className="absolute -top-[1px] -left-1/2 w-[200%] h-[2px] bg-gradient-to-r from-transparent via-brand-400/60 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
        />
      </div>

      {/* ── Title bar ── */}
      <div className="relative z-10 flex items-center gap-2 px-4 py-3 border-b border-surface-border bg-surface-50">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-fg-muted ml-2 font-mono">PocketDB — Query Editor</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          <span className="text-xs text-fg-subtle">prod_demo · PostgreSQL 16</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="relative z-10 flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-50/70 flex-wrap gap-y-1.5">
        {/* DB picker chip */}
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-surface-border bg-surface text-xs shrink-0 cursor-default">
          <FontAwesomeIcon icon={faDatabase} className="text-blue-400 text-xs" />
          <span className="text-fg-base font-mono font-medium">prod_demo</span>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 ml-1">PG</span>
          <FontAwesomeIcon icon={faChevronDown} className="text-fg-subtle text-[10px] ml-1" />
        </div>

        {/* Query switcher tabs */}
        <div className="flex items-center gap-1">
          {QE_DEMOS.map((q, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={cn(
                "px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap border",
                activeIdx === i
                  ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                  : "text-fg-subtle hover:text-fg-base hover:bg-surface-100 border-transparent",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5">
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-xs" />
            <span className="hidden sm:inline">History</span>
            <span className="bg-brand-500/20 text-brand-400 px-1.5 rounded-full text-[10px] leading-none py-0.5">12</span>
          </button>
          <button className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 bg-brand-500/10 border-brand-500/40 text-brand-400">
            <FontAwesomeIcon icon={faRobot} className="text-xs" />
            <span className="hidden sm:inline">AI</span>
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-70"
          >
            <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={cn("text-xs", isRunning && "animate-spin")} />
            {isRunning ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {/* ── Main 3-column area ── */}
      <div className="relative z-10 flex" style={{ height: 500 }}>

        {/* Schema sidebar */}
        <div className="w-44 border-r border-surface-border overflow-y-auto shrink-0 bg-surface hidden lg:block">
          <div className="p-2">
            <p className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider px-1 py-1.5 mb-0.5">Schema</p>
            {QE_SCHEMA.map((table) => (
              <div key={table.name} className="mb-0.5">
                <button
                  onClick={() => setExpanded(expanded === table.name ? null : table.name)}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-surface-100 text-left"
                >
                  <FontAwesomeIcon icon={faTableCells} className="text-brand-400 text-[10px] shrink-0" />
                  <span className="text-xs font-mono text-fg-base flex-1 truncate">{table.name}</span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={cn("text-fg-subtle text-[9px] shrink-0 transition-transform", expanded === table.name && "rotate-180")}
                  />
                </button>
                {expanded === table.name && (
                  <div className="ml-3.5 border-l border-surface-border pl-2 mb-1">
                    {table.cols.map((col) => (
                      <div key={col} className="flex items-center gap-1.5 py-[3px]">
                        <span className={cn("w-1.5 h-1.5 rounded-sm shrink-0", col === table.pk ? "bg-yellow-400" : "bg-fg-subtle/25")} />
                        <span className="text-[10px] font-mono text-fg-subtle">{col}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: editor + results */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* SQL editor — always dark regardless of page theme */}
          <div className="border-b border-surface-border flex flex-col shrink-0" style={{ height: "46%" }}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#30363d] bg-[#161b22] shrink-0">
              <FontAwesomeIcon icon={faCode} className="text-[#6e7681] text-[10px]" />
              <span className="text-[10px] text-[#8b949e] font-mono">editor.sql</span>
              <span className="ml-auto text-[10px] text-[#6e7681]">⌘↵ to run</span>
            </div>
            <div className="flex-1 overflow-auto bg-[#0d1117] p-3 font-mono text-xs leading-relaxed">
              {demo.sql.map((line, li) => (
                <div key={`${activeIdx}-${li}`} className="flex items-start min-h-[1.4rem]">
                  <span className="text-[#3d444d] w-5 text-right mr-4 select-none text-[10px] leading-relaxed shrink-0">
                    {li + 1}
                  </span>
                  <span>{renderSQLLine(line)}</span>
                </div>
              ))}
              <div className="flex items-start min-h-[1.4rem] mt-0.5">
                <span className="w-5 mr-4 shrink-0" />
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="inline-block w-[2px] h-[14px] bg-brand-400 rounded-[1px]"
                />
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-surface-border bg-surface-50/60 shrink-0">
              {(["output", "browse"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "text-xs px-3 py-1 rounded capitalize transition-colors",
                    activeTab === tab ? "bg-brand-500/20 text-brand-400" : "text-fg-subtle hover:text-fg-base",
                  )}
                >
                  {tab === "output" ? "Output" : "Browse"}
                </button>
              ))}
              {isRunning ? (
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-brand-400">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[10px]" />
                  Executing…
                </span>
              ) : (
                <span className="ml-auto text-[10px] text-green-400">{result.rows.length} rows · {result.execMs}ms</span>
              )}
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              {activeTab === "output" ? (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-surface-100">
                    <tr>
                      {result.columns.map((col) => (
                        <th key={col} className="text-left px-3 py-2 text-fg-subtle font-semibold border-b border-surface-border whitespace-nowrap text-[11px]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <motion.tr
                        key={`${runKey}-${ri}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: ri * 0.045, duration: 0.22 }}
                        className="border-b border-surface-border/40 hover:bg-surface-100/50 transition-colors"
                      >
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-fg-base font-mono text-[11px] max-w-[200px] truncate">
                            {cell}
                          </td>
                        ))}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-3 space-y-1.5">
                  {QE_SCHEMA.map((t) => (
                    <div key={t.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-100 border border-surface-border hover:border-brand-500/30 transition-colors cursor-default">
                      <FontAwesomeIcon icon={faTableCells} className="text-brand-400 text-xs" />
                      <span className="font-mono text-xs text-fg-base flex-1">{t.name}</span>
                      <span className="text-[10px] text-fg-subtle">{t.cols.length} cols</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI panel — always visible, animated simulation */}
        <div className="border-l border-surface-border flex flex-col overflow-hidden shrink-0 bg-surface w-[260px] xl:w-[290px] hidden md:flex">
          {/* Panel header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-border bg-surface-50 shrink-0">
            <div className="w-5 h-5 rounded bg-brand-600/20 flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faRobot} className="text-brand-400" style={{ fontSize: "9px" }} />
            </div>
            <span className="text-xs font-semibold text-fg-base">AI Assistant</span>
            <span className="ml-auto text-[10px] text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-full">Gemini 2.0</span>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {/* User bubble — typewriter */}
            <div className="flex justify-end">
              <div className="bg-brand-600/20 border border-brand-500/30 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[92%] min-h-[32px]">
                <p className="text-xs text-fg-base break-words">
                  {aiQDisplayed}
                  {(aiPhase === "typing-q") && (
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="inline-block w-[2px] h-[11px] bg-brand-400 ml-[2px] align-text-bottom rounded-[1px]"
                    />
                  )}
                </p>
              </div>
            </div>

            {/* Thinking dots */}
            {aiPhase === "thinking" && (
              <div className="flex items-center gap-2 pl-1">
                <div className="w-5 h-5 rounded bg-brand-600/20 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faRobot} className="text-brand-400" style={{ fontSize: "9px" }} />
                </div>
                <div className="flex items-center gap-1 py-1">
                  {[0, 160, 320].map((delay, i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-brand-400/70 animate-bounce"
                      style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* AI response */}
            {(aiPhase === "typing-a" || aiPhase === "done") && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-5 h-5 rounded bg-brand-600/20 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faRobot} className="text-brand-400" style={{ fontSize: "9px" }} />
                  </div>
                  <span className="text-[10px] text-brand-400 font-semibold">PocketDB AI</span>
                </div>
                <div className="pl-6 space-y-2">
                  <p className="text-xs text-fg-base leading-relaxed">
                    {aiADisplayed}
                    {aiPhase === "typing-a" && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="inline-block w-[2px] h-[11px] bg-brand-400 ml-[2px] align-text-bottom rounded-[1px]"
                      />
                    )}
                  </p>

                  {/* SQL code block — slides in when done typing answer */}
                  {aiPhase === "done" && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="rounded-xl border border-[#30363d] bg-[#0d1117] overflow-hidden"
                    >
                      <div className="px-3 py-1.5 border-b border-[#30363d] bg-[#161b22] flex justify-between items-center">
                        <span className="text-[10px] text-[#8b949e] font-mono uppercase tracking-wide">sql</span>
                        <span className="text-[10px] text-[#8b949e]">Copy</span>
                      </div>
                      <pre className="px-3 py-2.5 text-[11px] font-mono text-[#7ee787] overflow-x-auto leading-relaxed whitespace-pre">{aiPrompt.sql}</pre>
                      <div className="px-3 py-2 border-t border-[#30363d] bg-[#161b22] flex gap-2">
                        <button className="btn-secondary text-[10px] py-1 px-2 flex-1 flex items-center justify-center gap-1">
                          <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                          Use in Editor
                        </button>
                        <button className="btn-primary text-[10px] py-1 px-2 flex-1 flex items-center justify-center gap-1">
                          <FontAwesomeIcon icon={faPlay} className="text-[10px]" />
                          Execute
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-surface-border p-2">
            <div className="relative">
              <input
                placeholder="Ask about your database…"
                className="w-full bg-surface-100 border border-surface-border rounded-xl pl-3 pr-10 py-2 text-xs text-fg-base placeholder:text-fg-subtle focus:outline-none focus:border-brand-500 transition-colors"
                readOnly
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-lg bg-brand-600 hover:bg-brand-500 transition-colors">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-white text-[10px]" />
              </button>
            </div>
            <p className="text-[10px] text-fg-subtle text-center mt-1.5">↵ to send · ⇧↵ newline</p>
          </div>
        </div>
      </div>
    </motion.div>
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
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  /* Navbar background on scroll */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const features = [
    {
      icon: faCubes,
      title: "Multi-Engine Support",
      description:
        "Deploy PostgreSQL, MySQL, and Redis clusters from a unified interface. Mix and match engines.",
    },
    {
      icon: faCircleNodes,
      title: "Flexible Topologies",
      description:
        "Standalone, primary-replica, or multi-primary — configure the exact replication topology you need.",
    },
    {
      icon: faGaugeHigh,
      title: "Real-Time Monitoring",
      description:
        "Live CPU, memory stats, container logs, and health checks for every node in your cluster.",
    },
    {
      icon: faTerminal,
      title: "Built-in Query Editor",
      description:
        "Execute SQL directly from the browser with syntax highlighting, auto-complete, and history.",
    },
    {
      icon: faBrain,
      title: "AI SQL Assistant",
      description:
        "Get AI-powered query suggestions, natural language to SQL conversion, and schema explanations.",
    },
    {
      icon: faDiagramProject,
      title: "ERD Generator",
      description:
        "Auto-generate beautiful entity-relationship diagrams from your live database schema.",
    },
    {
      icon: faShieldHalved,
      title: "Resource Controls",
      description:
        "Set per-node CPU and memory limits. Docker-native isolation keeps your machine stable.",
    },
    {
      icon: faDocker,
      title: "Docker-Powered",
      description:
        "Every cluster runs in isolated Docker containers with dedicated networks and named volumes.",
    },
  ];

  const stats = [
    { value: "3", label: "Database Engines", suffix: "" },
    { value: "30", label: "Second Deploy", suffix: "s" },
    { value: "100", label: "Open Source", suffix: "%" },
    { value: "8", label: "Core Features", suffix: "+" },
  ];

  return (
    <SmoothScroll>
    <div className="min-h-screen overflow-hidden">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-surface-border/60 bg-surface/85 backdrop-blur-xl shadow-lg shadow-black/5"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
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
              className="btn-primary text-sm py-2 px-5 group"
            >
              Get Started
              <FontAwesomeIcon
                icon={faArrowRight}
                className="text-xs group-hover:translate-x-0.5 transition-transform"
              />
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero Section ───────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        <HeroBackground />

        {/* Floating chips around hero */}
        <FloatingChip x="5%" y="30%" delay={1}>
          <FontAwesomeIcon icon={faDatabase} className="text-blue-400 text-[10px]" />
          <span>PostgreSQL 16</span>
        </FloatingChip>
        <FloatingChip x="85%" y="25%" delay={1.3}>
          <FontAwesomeIcon icon={faDocker} className="text-blue-400 text-[10px]" />
          <span>Docker Native</span>
        </FloatingChip>
        <FloatingChip x="8%" y="65%" delay={1.6}>
          <FontAwesomeIcon icon={faBrain} className="text-pink-400 text-[10px]" />
          <span>AI-Powered</span>
        </FloatingChip>
        <FloatingChip x="82%" y="60%" delay={1.9}>
          <FontAwesomeIcon icon={faChartLine} className="text-green-400 text-[10px]" />
          <span>Live Metrics</span>
        </FloatingChip>

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
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-medium text-brand-400">
                  Open Source Database Cluster Manager
                </span>
              </motion.div>
            </FadeIn>

            {/* Heading */}
            <FadeIn delay={0.1}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-fg-strong tracking-tight leading-[1.1] mb-6">
                Spin up database
                <br className="hidden sm:block" />
                clusters in{" "}
                <TypewriterText words={["seconds", "one click", "any engine"]} />
              </h1>
            </FadeIn>

            {/* Subheading */}
            <FadeIn delay={0.2}>
              <p className="text-lg md:text-xl text-fg-muted max-w-2xl mx-auto mb-10 leading-relaxed">
                Docker-powered PostgreSQL, MySQL &amp; Redis clusters with a sleek UI.
                Full lifecycle management, live monitoring, AI assistant, and a built-in query editor.
              </p>
            </FadeIn>

            {/* CTA Buttons */}
            <FadeIn delay={0.3}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="btn-primary text-base py-3 px-8 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-shadow group"
                >
                  <FontAwesomeIcon icon={faRocket} className="text-sm" />
                  Start for Free
                  <FontAwesomeIcon
                    icon={faArrowRight}
                    className="text-xs opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200"
                  />
                </Link>
                <a href="#demo" className="btn-secondary text-base py-3 px-8 group">
                  <FontAwesomeIcon icon={faPlay} className="text-xs group-hover:scale-110 transition-transform" />
                  See it in Action
                </a>
              </div>
            </FadeIn>

            {/* Stats */}
            <FadeIn delay={0.45}>
              <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-16">
                {stats.map((s, i) => (
                  <div key={s.label} className="text-center group">
                    <div className="text-3xl md:text-4xl font-bold text-fg-strong tracking-tight">
                      {s.value === "∞" ? (
                        "∞"
                      ) : (
                        <AnimatedCounter value={s.value} suffix={s.suffix} />
                      )}
                    </div>
                    <div className="text-xs text-fg-muted mt-1.5 font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </motion.div>
      </section>

      {/* ── Query Editor Live Demo ─────────────────────────────── */}
      <section id="query-editor" className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/20 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">
              <FontAwesomeIcon icon={faTerminal} className="text-[10px]" />
              Query Editor
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-4 tracking-tight">
              Write SQL. See results instantly.
            </h2>
            <p className="text-fg-muted max-w-2xl mx-auto text-lg">
              A full-featured SQL editor right in your browser — syntax highlighting,
              schema browser, query history, live results, and an AI assistant that
              understands your schema.
            </p>
          </FadeIn>

          {/* Feature pills row */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {[
              { icon: faCode,             label: "Syntax Highlighting", desc: "Keywords, tables, and columns colored in real-time" },
              { icon: faWandMagicSparkles, label: "AI SQL Assistant",    desc: "Ask in plain English, get runnable queries instantly" },
              { icon: faClockRotateLeft,  label: "Query History",        desc: "Every query saved with execution time and row count" },
              { icon: faDiagramProject,  label: "ERD Generator",        desc: "Auto-generate entity-relationship diagrams on click" },
            ].map((item, i) => (
              <FadeIn key={item.label} delay={i * 0.07}>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-50 border border-surface-border h-full">
                  <div className="w-8 h-8 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <FontAwesomeIcon icon={item.icon} className="text-brand-400 text-xs" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-fg-strong mb-1">{item.label}</p>
                    <p className="text-xs text-fg-muted leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Interactive demo */}
          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-radial from-brand-500/10 via-transparent to-transparent rounded-3xl blur-3xl pointer-events-none" />
            <QueryEditorDemo />
          </div>

          {/* Hint below demo */}
          <FadeIn delay={0.2}>
            <p className="text-center text-sm text-fg-subtle mt-6 flex items-center justify-center gap-2">
              <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
                ↑
              </motion.span>
              Click <span className="text-brand-400 font-medium">Run</span> to execute a query · Switch queries with the tabs · Toggle
              <span className="text-brand-400 font-medium ml-1">AI</span> to open the assistant
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── Engine Marquee ─────────────────────────────────────── */}
      <section className="relative -mt-4 mb-8">
        <FadeIn delay={0.2}>
          <EngineMarquee />
        </FadeIn>
      </section>

      {/* ── Live Demo Section ──────────────────────────────────── */}
      <section id="demo" className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/20 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="text-[10px]" />
              Live Preview
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-4 tracking-tight">
              Your command center, reimagined
            </h2>
            <p className="text-fg-muted max-w-xl mx-auto text-lg">
              A clean, powerful dashboard to manage all your database clusters in one place.
            </p>
          </FadeIn>

          <div className="relative">
            {/* Glow behind the mockup */}
            <div className="absolute -inset-8 bg-gradient-radial from-brand-500/10 via-transparent to-transparent rounded-3xl blur-3xl pointer-events-none" />
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── Features Bento Grid ────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/20 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">
              <FontAwesomeIcon icon={faCubes} className="text-[10px]" />
              Features
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-4 tracking-tight">
              Everything you need, built&nbsp;in
            </h2>
            <p className="text-fg-muted max-w-xl mx-auto text-lg">
              Professional-grade cluster management without the ops complexity.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <BentoCard key={f.title} {...f} delay={i * 0.06} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Terminal Demo ──────────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <FadeIn direction="right">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/20 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">
                  <FontAwesomeIcon icon={faCode} className="text-[10px]" />
                  Developer Experience
                </span>
                <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-5 tracking-tight">
                  From zero to cluster
                  <br className="hidden md:block" />
                  in one command
                </h2>
                <p className="text-fg-muted mb-8 leading-relaxed text-lg">
                  Create multi-node database clusters with a single click — or use the API.
                  PocketDB handles networking, volumes, health checks, and resource limits.
                </p>
                <ul className="space-y-4">
                  {[
                    "Dedicated Docker networks per cluster",
                    "Named volumes for data persistence",
                    "Configurable CPU & memory limits",
                    "Automatic health monitoring",
                    "AI-powered SQL suggestions",
                  ].map((item, i) => (
                    <motion.li
                      key={item}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className="flex items-center gap-3 text-sm text-fg-muted"
                    >
                      <span className="w-6 h-6 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faCheck} className="text-brand-400 text-[10px]" />
                      </span>
                      {item}
                    </motion.li>
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
      <section className="relative py-20 md:py-32 overflow-hidden">
        {/* Background dots */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="16" cy="16" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <FadeIn className="text-center mb-20">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/20 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">
              <FontAwesomeIcon icon={faRocket} className="text-[10px]" />
              How it Works
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-4 tracking-tight">
              Three steps to production-like databases
            </h2>
            <p className="text-fg-muted max-w-lg mx-auto text-lg">
              Go from zero to a fully running cluster in under 30 seconds.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-[60px] left-[20%] right-[20%] h-px pointer-events-none">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-500/30 via-brand-400/40 to-brand-500/30"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                style={{ originX: 0 }}
              />
            </div>

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
                <SpotlightCard>
                  <div className="p-8 text-center">
                    {/* Step number */}
                    <motion.div
                      whileInView={{ scale: [0.5, 1.1, 1] }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-600 text-white text-sm font-bold mb-6 shadow-lg shadow-brand-500/25"
                    >
                      {item.step}
                    </motion.div>

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
                </SpotlightCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────── */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn>
            <div className="relative rounded-3xl border border-surface-border overflow-hidden">
              {/* Animated gradient background */}
              <div className="absolute inset-0">
                <motion.div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background:
                      "radial-gradient(ellipse at 30% 50%, rgb(var(--brand-600) / 0.3), transparent 60%), radial-gradient(ellipse at 70% 50%, rgb(var(--brand-400) / 0.2), transparent 60%)",
                  }}
                  animate={{ opacity: [0.3, 0.5, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="absolute inset-0 bg-surface-50/80 backdrop-blur-sm" />
              </div>

              <div className="relative z-10 py-20 md:py-28 px-8 text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  whileInView={{ scale: 1, rotate: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-3xl bg-brand-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-brand-500/30"
                >
                  <FontAwesomeIcon icon={faDatabase} className="text-white text-3xl" />
                </motion.div>

                <h2 className="text-3xl md:text-5xl font-bold text-fg-strong mb-5 tracking-tight">
                  Ready to simplify your
                  <br className="hidden sm:block" />
                  database workflow?
                </h2>
                <p className="text-fg-muted max-w-lg mx-auto mb-10 text-lg">
                  Stop wrestling with Docker commands. Get a beautiful interface to manage all your database clusters.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/register"
                    className="btn-primary text-base py-3.5 px-10 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-shadow group"
                  >
                    <FontAwesomeIcon icon={faBolt} />
                    Get Started Now
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="text-xs group-hover:translate-x-0.5 transition-transform"
                    />
                  </Link>
                  <Link href="/login" className="btn-secondary text-base py-3.5 px-10">
                    Sign In
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-surface-border">
        <div className="max-w-7xl mx-auto px-6">
          {/* Main footer */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-16">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
                  <FontAwesomeIcon icon={faDatabase} className="text-white text-sm" />
                </div>
                <span className="text-lg font-bold text-fg-strong tracking-tight">PocketDB</span>
              </div>
              <p className="text-sm text-fg-muted leading-relaxed max-w-xs">
                Lightweight, Docker-powered database cluster manager with a beautiful UI.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold text-fg-strong uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2.5">
                {["Clusters", "Query Editor", "ERD Generator", "AI Assistant", "Monitoring"].map((item) => (
                  <li key={item}>
                    <span className="text-sm text-fg-muted hover:text-fg-strong transition-colors cursor-default">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Engines */}
            <div>
              <h4 className="text-xs font-semibold text-fg-strong uppercase tracking-wider mb-4">Engines</h4>
              <ul className="space-y-2.5">
                {["PostgreSQL", "MySQL", "Redis"].map((item) => (
                  <li key={item}>
                    <span className="text-sm text-fg-muted hover:text-fg-strong transition-colors cursor-default">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Account */}
            <div>
              <h4 className="text-xs font-semibold text-fg-strong uppercase tracking-wider mb-4">Account</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/login" className="text-sm text-fg-muted hover:text-fg-strong transition-colors">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-sm text-fg-muted hover:text-fg-strong transition-colors">
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-t border-surface-border">
            <p className="text-xs text-fg-subtle">
              &copy; {new Date().getFullYear()} PocketDB. Open source under MIT License.
            </p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                All systems operational
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </SmoothScroll>
  );
}
