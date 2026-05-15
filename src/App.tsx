/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Activity, 
  Box, 
  Cpu, 
  Layers, 
  Lock, 
  Maximize2, 
  MousePointer2, 
  RefreshCcw, 
  Zap,
  Home,
  ShoppingBag,
  Building2,
  Bug,
  Navigation
} from 'lucide-react';
import { evolveLSystem, matchNodes, mulberry32, partition, generateId } from './lib/simulation';
import { Block, GameState, Node, Drone, Virus, Edge } from './types';

const INITIAL_SEED = '0x88AF2';
const MIN_BLOCK_SIZE = 60;
const MAX_BSP_LEVEL = 4;

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [showMechanics, setShowMechanics] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isGameWon, setIsGameWon] = useState(false);
  const [globalStability, setGlobalStability] = useState(0);

  const [gameState, setGameState] = useState<GameState>(() => {
    const seed = INITIAL_SEED;
    const rng = mulberry32(parseInt(seed, 16));
    const initialBlocks = partition(
      { x: 0, y: 0, width: 1000, height: 1000, id: 'root' },
      0,
      MAX_BSP_LEVEL,
      MIN_BLOCK_SIZE,
      rng
    );

    return {
      blocks: initialBlocks,
      nodes: [],
      edges: [],
      drones: [],
      viruses: [],
      credits: 200,
      level: 1,
      ticks: 0,
      seed,
      recentDeliveries: [],
    };
  });

  const stateRef = useRef(gameState);
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [stabilityMode, setStabilityMode] = useState(false);
  const [matches, setMatches] = useState<{ [key: string]: string }>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  const resetGame = () => {
    const seed = '0x' + Math.floor(Math.random() * 0xFFFFF).toString(16).toUpperCase();
    const rng = mulberry32(parseInt(seed, 16));
    const initialBlocks = partition(
      { x: 0, y: 0, width: 1000, height: 1000, id: 'root' },
      0,
      MAX_BSP_LEVEL,
      MIN_BLOCK_SIZE,
      rng
    );

    setGameState({
      blocks: initialBlocks,
      nodes: [],
      edges: [],
      drones: [],
      viruses: [],
      credits: 200,
      level: 1,
      ticks: 0,
      seed,
      recentDeliveries: [],
    });
    setIsGameOver(false);
    setIsGameWon(false);
  };

  // Sync state to URL Hash - debounced to avoid per-frame updates
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = {
        seed: gameState.seed,
        credits: Math.floor(gameState.credits),
        level: gameState.level
      };
      window.location.hash = btoa(JSON.stringify(state));
    }, 2000);
    return () => clearTimeout(timer);
  }, [gameState.seed, Math.floor(gameState.credits / 10), gameState.level]);

  // Load state from hash on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      try {
        const decoded = JSON.parse(atob(hash));
        if (decoded.seed) {
        }
      } catch (e) {
        console.error('Failed to parse state from hash', e);
      }
    }
  }, []);

  // Sync nodes to blocks - only run when structure changes
  const blocksKey = useMemo(() => {
    return gameState.blocks.filter(b => b.isLeaf).map(b => b.id).join(',');
  }, [gameState.blocks.length]);

  useEffect(() => {
    const rng = mulberry32(parseInt(gameState.seed, 16));
    const newNodes: Node[] = [];
    gameState.blocks.filter(b => b.isLeaf).forEach(block => {
      let type: 'Home' | 'Job' | 'Shop' | 'Tower' = 'Home';
      if (block.type === 'Commercial') type = 'Shop';
      else if (block.type === 'Industrial') type = 'Tower';
      
      newNodes.push({
        id: `node-${block.id}`,
        x: block.x + block.width / 2,
        y: block.y + block.height / 2,
        type: (type === 'Home' ? 'Home' : 'Job'),
        blockId: block.id
      });
    });

    // Create Edges for ACO
    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const n1 = newNodes[i];
        const n2 = newNodes[j];
        const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y);
        
        // Connect nodes that are relatively close (approx neighbor blocks)
        if (dist < 350) {
          newEdges.push({
            id: `edge-${n1.id}-${n2.id}`,
            fromId: n1.id,
            toId: n2.id,
            pheromone: 0.1, // Initial base pheromone
            distance: dist
          });
        }
      }
    }

    setGameState(prev => ({ ...prev, nodes: newNodes, edges: newEdges }));
  }, [blocksKey, gameState.seed]);

  // Handle Stability Matching and Global Score
  useEffect(() => {
    const homes = gameState.nodes.filter(n => n.type === 'Home');
    const jobs = gameState.nodes.filter(n => n.type === 'Job');
    const newMatches = matchNodes(homes, jobs);
    setMatches(newMatches);

    // Calculate Global Harmony
    let stableCount = 0;
    const total = Object.keys(newMatches).length;
    Object.entries(newMatches).forEach(([hId, jId]) => {
      const hNode = gameState.nodes.find(n => n.id === hId);
      const jNode = gameState.nodes.find(n => n.id === jId);
      if (hNode && jNode) {
        const dist = Math.hypot(hNode.x - jNode.x, hNode.y - jNode.y);
        if (dist < 400) stableCount++;
      }
    });
    setGlobalStability(total === 0 ? 0 : stableCount / total);
  }, [gameState.nodes]);

  // Main Loop for Drones and Pheromones
  const animate = useCallback((time: number) => {
    if (!isStarted || isGameOver || isGameWon) return;
    
    setGameState(prev => {
      const nextTicks = prev.ticks + 1;
      let dronesFinishedCount = 0;
      const deliveries: { x: number, y: number, id: string, timer: number }[] = [];
      
      // Decay Pheromones
      const nextEdges = prev.edges.map(e => ({
        ...e,
        pheromone: Math.max(0.1, e.pheromone * 0.99) // 1% decay per tick
      }));

      // Calculate current global harmony internally for the win check
      let harmony = 0;
      const homes = prev.nodes.filter(n => n.type === 'Home');
      const jobs = prev.nodes.filter(n => n.type === 'Job');
      const currentMatches = matchNodes(homes, jobs);
      let stableCount = 0;
      const total = Object.keys(currentMatches).length;
      Object.entries(currentMatches).forEach(([hId, jId]) => {
        const hNode = prev.nodes.find(n => n.id === hId);
        const jNode = prev.nodes.find(n => n.id === jId);
        if (hNode && jNode) {
          const dist = Math.hypot(hNode.x - jNode.x, hNode.y - jNode.y);
          if (dist < 400) stableCount++;
        }
      });
      harmony = total === 0 ? 0 : stableCount / total;
      
      // Tier 3: Spawn Viruses
      let nextViruses = [...prev.viruses];
      const leafCount = prev.blocks.filter(b => b.isLeaf).length;
      if (leafCount >= 15 && nextTicks % 300 === 0 && nextViruses.length < 5) {
        nextViruses.push({
          id: generateId(),
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          vx: 0,
          vy: 0,
          targetX: Math.random() * 1000,
          targetY: Math.random() * 1000,
        });
      }

      // Update Viruses
      nextViruses = nextViruses.map(v => {
        const dx = v.targetX - v.x;
        const dy = v.targetY - v.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 5) {
          return {
            ...v,
            targetX: Math.random() * 1000,
            targetY: Math.random() * 1000,
          };
        }

        return {
          ...v,
          x: v.x + (dx / dist) * 1,
          y: v.y + (dy / dist) * 1,
        };
      });

      // Update Drones (ACO Logic)
      let nextDrones = [...prev.drones];
      if (nextTicks % 40 === 0 && prev.drones.length < 150) {
        const homeNodes = prev.nodes.filter(n => n.type === 'Home');
        const jobNodes = prev.nodes.filter(n => n.type === 'Job');
        if (homeNodes.length && jobNodes.length) {
          const start = homeNodes[Math.floor(Math.random() * homeNodes.length)];
          const target = jobNodes[Math.floor(Math.random() * jobNodes.length)];
          
          nextDrones.push({
            id: generateId(),
            x: start.x,
            y: start.y,
            startNodeId: start.id,
            targetNodeId: target.id,
            currentNodeId: start.id,
            nextNodeId: null,
            path: [start.id],
            progress: 0,
            speed: 2 + Math.random() * 2,
            isScrambled: false
          });
        }
      }

      const pathsToReward: string[][] = [];

      nextDrones = nextDrones.map(drone => {
        let currentTargetNodeId = drone.nextNodeId;

        // If drone has no next node, choose one using ACO
        if (!currentTargetNodeId) {
          const neighbors = nextEdges.filter(e => e.fromId === drone.currentNodeId || e.toId === drone.currentNodeId);
          if (neighbors.length === 0) return { ...drone, progress: 1 }; // Stuck

          // Calculate weights for picking neighbor
          const targetNode = prev.nodes.find(n => n.id === drone.targetNodeId);
          const weights = neighbors.map(edge => {
            const neighborId = edge.fromId === drone.currentNodeId ? edge.toId : edge.fromId;
            const neighborNode = prev.nodes.find(n => n.id === neighborId)!;
            
            // Heuristic component (Inverse distance to final target)
            const distToTarget = Math.hypot(neighborNode.x - (targetNode?.x || 0), neighborNode.y - (targetNode?.y || 0));
            const eta = 1 / (distToTarget + 1);
            
            // Pheromone component
            const tau = edge.pheromone;
            
            return { id: neighborId, weight: Math.pow(tau, 1.5) * Math.pow(eta, 2) };
          });

          // Probabilistic selection
          const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
          let r = Math.random() * totalWeight;
          let selectedId = weights[0].id;
          for (const w of weights) {
            r -= w.weight;
            if (r <= 0) {
              selectedId = w.id;
              break;
            }
          }
          currentTargetNodeId = selectedId;
          drone.nextNodeId = selectedId;
        }

        const targetNode = prev.nodes.find(n => n.id === currentTargetNodeId);
        if (!targetNode) return drone;

        // Virus Interference
        const nearbyVirus = nextViruses.find(v => Math.hypot(v.x - drone.x, v.y - drone.y) < 40);
        const isScrambled = !!nearbyVirus;

        let vx = 0;
        let vy = 0;
        const dx = isScrambled ? (Math.random() - 0.5) * 10 : targetNode.x - drone.x;
        const dy = isScrambled ? (Math.random() - 0.5) * 10 : targetNode.y - drone.y;

        if (!isScrambled) {
          const dist = Math.hypot(dx, dy);
          if (dist > 3) {
            vx = (dx / dist) * drone.speed;
            vy = (dy / dist) * drone.speed;
          } else {
            // Reached next node
            const nextPath = [...drone.path, currentTargetNodeId];
            if (currentTargetNodeId === drone.targetNodeId) {
              // Final target reached!
              dronesFinishedCount++;
              deliveries.push({ x: drone.x, y: drone.y, id: generateId(), timer: 30 });
              pathsToReward.push(nextPath);
              return { ...drone, progress: 1 };
            } else {
              // Move to next node in graph
              return {
                ...drone,
                x: targetNode.x,
                y: targetNode.y,
                currentNodeId: currentTargetNodeId,
                nextNodeId: null, // Will choose next one in next tick
                path: nextPath
              };
            }
          }
        } else {
          vx = (Math.random() - 0.5) * 4;
          vy = (Math.random() - 0.5) * 4;
        }
        
        return {
          ...drone,
          x: drone.x + vx,
          y: drone.y + vy,
          isScrambled
        };
      }).filter(d => d.progress < 1);

      // Reward paths with pheromones
      pathsToReward.forEach(path => {
        for (let i = 0; i < path.length - 1; i++) {
          const u = path[i];
          const v = path[i + 1];
          const edge = nextEdges.find(e => (e.fromId === u && e.toId === v) || (e.fromId === v && e.toId === u));
          if (edge) {
            edge.pheromone += 0.5; // Reinforcement
          }
        }
      });

      // Update Blocks (Corruption)
      const nextBlocks = prev.blocks.map(block => {
        const nearbyVirus = nextViruses.find(v => 
          v.x >= block.x && v.x <= block.x + block.width &&
          v.y >= block.y && v.y <= block.y + block.height
        );
        
        if (nearbyVirus) {
          return { ...block, corruptedUntil: nextTicks + 180 };
        }
        return block;
      });

      // Economy logic
      const maintenanceCost = prev.blocks.filter(b => b.isLeaf).length * 0.002;
      const earnings = dronesFinishedCount * 10;
      const nextCredits = prev.credits - maintenanceCost + earnings;

      // Update recent deliveries
      const nextRecentDeliveries = [
        ...prev.recentDeliveries.map(d => ({ ...d, timer: d.timer - 1 })),
        ...deliveries
      ].filter(d => d.timer > 0);

      // Win/Loss Checks
      if (nextCredits <= 0) {
        setIsGameOver(true);
        return { ...prev, credits: 0 };
      }
      
      if (harmony > 0.9 && prev.blocks.filter(b => b.isLeaf).length >= 25) {
        setIsGameWon(true);
      }

      return {
        ...prev,
        ticks: nextTicks,
        drones: nextDrones,
        edges: nextEdges,
        viruses: nextViruses,
        blocks: nextBlocks,
        credits: nextCredits,
        recentDeliveries: nextRecentDeliveries
      };
    });
    
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw pheromones (Optional visualization)
        stateRef.current.edges.forEach(edge => {
          if (edge.pheromone > 0.15) {
            const from = stateRef.current.nodes.find(n => n.id === edge.fromId);
            const to = stateRef.current.nodes.find(n => n.id === edge.toId);
            if (from && to) {
              ctx.save();
              ctx.strokeStyle = '#39FF14';
              ctx.globalAlpha = Math.min(0.3, (edge.pheromone - 0.1) * 0.1);
              ctx.lineWidth = Math.min(3, edge.pheromone);
              ctx.beginPath();
              ctx.moveTo(from.x, from.y);
              ctx.lineTo(to.x, to.y);
              ctx.stroke();
              ctx.restore();
            }
          }
        });

        // Draw drones
        stateRef.current.drones.forEach(drone => {
          ctx.save();
          ctx.translate(drone.x, drone.y);
          
          const targetNode = stateRef.current.nodes.find(n => n.id === drone.nextNodeId || n.id === drone.targetNodeId);
          if (targetNode) {
            const angle = Math.atan2(targetNode.y - drone.y, targetNode.x - drone.x);
            ctx.rotate(angle);
          }

          // Draw trail
          ctx.beginPath();
          ctx.strokeStyle = drone.isScrambled ? 'rgba(255, 49, 49, 0.4)' : 'rgba(57, 255, 20, 0.3)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.moveTo(-15, 0);
          ctx.lineTo(-5, 0);
          ctx.stroke();

          // Engine Glow
          ctx.beginPath();
          ctx.fillStyle = drone.isScrambled ? 'rgba(255, 49, 49, 0.9)' : 'rgba(0, 243, 255, 0.9)';
          ctx.arc(-6, 0, 3, 0, Math.PI * 2);
          ctx.fill();

          // Drone Body (Sharper, more distinctive)
          ctx.beginPath();
          ctx.strokeStyle = drone.isScrambled ? '#FF3131' : '#00F3FF';
          ctx.fillStyle = drone.isScrambled ? '#800000' : '#001a1a';
          ctx.lineWidth = 2;
          ctx.shadowBlur = drone.isScrambled ? 20 : 15;
          ctx.shadowColor = drone.isScrambled ? '#FF3131' : '#00F3FF';
          
          // Diamond/Delta Shape - Larger
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-6, 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Center Core
          ctx.beginPath();
          ctx.fillStyle = drone.isScrambled ? '#FF3131' : '#39FF14';
          ctx.arc(0, 0, 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        });

        // Draw deliveries
        stateRef.current.recentDeliveries.forEach(d => {
          ctx.save();
          ctx.fillStyle = '#39FF14';
          ctx.font = 'bold 16px Inter';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#39FF14';
          ctx.fillText('+10', d.x, d.y - (30 - d.timer));
          ctx.restore();
        });

        // Draw viruses
        stateRef.current.viruses.forEach(virus => {
          ctx.save();
          ctx.translate(virus.x, virus.y);
          ctx.rotate(stateRef.current.ticks * 0.1);
          
          // Bug Body
          ctx.beginPath();
          ctx.fillStyle = '#FF3131';
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#FF3131';
          ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Legs
          ctx.strokeStyle = '#FF3131';
          ctx.lineWidth = 1;
          for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            const angle = (i * Math.PI) / 3;
            ctx.moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3);
            ctx.lineTo(Math.cos(angle) * 7, Math.sin(angle) * 7);
            ctx.stroke();
          }
          
          // Antennas
          ctx.beginPath();
          ctx.moveTo(3, -2);
          ctx.lineTo(6, -5);
          ctx.moveTo(-3, -2);
          ctx.lineTo(-6, -5);
          ctx.stroke();
          
          ctx.restore();
        });
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isStarted, isGameOver, isGameWon]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);

  const handleRefactor = () => {
    if (selectedBlock && gameState.credits >= 10) {
      setGameState(prev => {
        const blockToSplit = prev.blocks.find(b => b.id === selectedBlock);
        if (!blockToSplit || !blockToSplit.isLeaf) return prev;
        
        const rng = mulberry32(Math.floor(Math.random() * 1000));
        const newBlocks = partition(
          blockToSplit,
          blockToSplit.level,
          blockToSplit.level + 1,
          MIN_BLOCK_SIZE / 2,
          rng
        ).filter(b => b.id !== blockToSplit.id);

        return {
          ...prev,
          credits: prev.credits - 10,
          blocks: [...prev.blocks.filter(b => b.id !== selectedBlock), ...newBlocks]
        };
      });
      setSelectedBlock(null);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-cyber-black font-sans text-neon-green selection:bg-neon-green selection:text-black overflow-hidden">
      <div className="noise" />
      <div className="scanline" />

      <AnimatePresence>
        {!isStarted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] glass flex items-center justify-center p-6 bg-black"
          >
            <div className="max-w-2xl w-full space-y-12 overflow-y-auto max-h-full py-10">
              <div className="space-y-4 text-center">
                <Cpu className="w-12 h-12 md:w-16 md:h-16 mx-auto text-neon-green animate-pulse" />
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter italic">SUDO-CITY</h1>
                <p className="text-neon-cyan font-mono text-xs md:text-sm tracking-widest uppercase px-4">The Algorithmic Urban Simulation</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 md:gap-8 text-xs md:text-sm px-4">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest border-b border-neon-green/30 pb-1">1. Expansion</h3>
                    <p className="opacity-70 leading-relaxed">Tap a district to inspect it. Spend <b>Energy</b> to divide it—smaller districts build taller, more efficient structures.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest border-b border-neon-green/30 pb-1">2. Energy Loss</h3>
                    <p className="opacity-70 leading-relaxed">The city consumes energy for maintenance. If your energy hits <b>0</b>, the system crashes and you lose.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest border-b border-neon-green/30 pb-1">3. Harvesting</h3>
                    <p className="opacity-70 leading-relaxed">Drones carry data between sectors. Each successful delivery generates <b>+10 Energy</b>.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest border-b border-neon-green/30 pb-1">4. Winning</h3>
                    <p className="opacity-70 leading-relaxed">Optimize your layout. Reach <b>90% Harmony</b> with at least <b>25 Districts</b> to ascend the simulation.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 md:pt-8 text-center space-y-6">
                <button 
                  onClick={() => setIsStarted(true)}
                  className="bg-neon-green text-black font-bold px-8 md:px-12 py-4 md:py-5 text-lg md:text-xl rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(57,255,20,0.3)] uppercase tracking-tighter w-full sm:w-auto"
                >
                  Enter the Grid
                </button>
                
                <div className="block">
                  <button 
                    onClick={() => setShowMechanics(!showMechanics)}
                    className="text-neon-cyan text-[10px] font-mono uppercase tracking-[0.2em] hover:text-white transition-colors"
                  >
                    {showMechanics ? '[ Hide System Specs ]' : '[ Decode Simulation Mechanics ]'}
                  </button>
                </div>

                <AnimatePresence>
                  {showMechanics && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 border border-neon-cyan/20 bg-neon-cyan/5 rounded-xl text-left space-y-4 font-mono text-[10px] md:text-xs leading-relaxed text-neon-cyan/80">
                        <div className="space-y-1">
                          <p className="text-neon-cyan font-bold uppercase tracking-wider">:: Pathfinding Intelligence (ACO)</p>
                          <p>Drones act like ants. When a drone reaches its target, it strengthens that path with "pheromones". Over time, drones naturally cluster into the most efficient routes. You don't direct them; you build the infrastructure they need to optimize themselves.</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-neon-cyan font-bold uppercase tracking-wider">:: Urban Harmony Algorithm</p>
                          <p>The city thrives when Residential sectors are close to Commercial and Industrial sectors. If jobs and homes are too far apart, harmony drops. High complexity districts (smaller ones) generate more traffic but are harder to keep stable.</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-neon-cyan font-bold uppercase tracking-wider">:: Energy Cycle</p>
                          <p>Maintenance is expensive. Every district you create increases the per-second energy drain. If you expand too fast without enough drones delivering data (+10 each), your energy reserve will deplete, crashing the simulation.</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {isGameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[200] glass flex items-center justify-center bg-black/90 p-6"
          >
            <div className="text-center space-y-8">
              <h2 className="text-6xl font-extrabold text-neon-red tracking-tighter animate-pulse uppercase">System Crash</h2>
              <p className="font-mono text-neon-red opacity-70">ENERGY DEPLETED. INFRASTRUCTURE COLLAPSED.</p>
              <button 
                onClick={resetGame}
                className="border-2 border-neon-red text-neon-red px-10 py-4 font-bold rounded-full hover:bg-neon-red hover:text-black transition-all uppercase tracking-widest"
              >
                Reboot System
              </button>
            </div>
          </motion.div>
        )}

        {isGameWon && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[200] glass flex items-center justify-center bg-black/90 p-6"
          >
            <div className="text-center space-y-8">
              <h2 className="text-6xl font-extrabold text-neon-cyan tracking-tighter animate-bounce uppercase">Ascension</h2>
              <p className="font-mono text-neon-cyan opacity-70">90% HARMONY REACHED. CITY HAS ACHIEVED TRANSUBSTANTIATION.</p>
              <button 
                onClick={resetGame}
                className="border-2 border-neon-cyan text-neon-cyan px-10 py-4 font-bold rounded-full hover:bg-neon-cyan hover:text-black transition-all uppercase tracking-widest"
              >
                New Simulation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header HUD */}
      <header className="absolute top-0 left-0 w-full z-50 p-4 md:p-6 flex flex-col md:flex-row justify-between items-center md:items-start gap-4 pointer-events-none">
        <div className="space-y-1 pointer-events-auto text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter flex items-center justify-center md:justify-start gap-3">
            <Cpu className="w-6 h-6 md:w-8 h-8 text-neon-green" />
            SUDO-CITY
          </h1>
          <div className="flex justify-center md:justify-start gap-4 font-mono text-[10px] md:text-xs opacity-70">
            <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-neon-cyan" /> DISTRICTS: {gameState.blocks.filter(b => b.isLeaf).length}</span>
            <span className={`flex items-center gap-1 ${gameState.credits < 20 ? 'text-neon-red animate-pulse' : ''}`}>
              <Zap className="w-3 h-3" /> ENERGY: {Math.floor(gameState.credits)}
              <span className="text-[8px] opacity-50 ml-1">(-{(gameState.blocks.filter(b => b.isLeaf).length * 0.002 * 60).toFixed(1)}/s)</span>
            </span>
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> HARMONY: {Math.floor(globalStability * 100)}%</span>
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto items-center">
          <div className="hidden md:flex flex-col items-end mr-4">
            <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden border border-white/20">
              <motion.div 
                className="h-full bg-neon-cyan"
                animate={{ width: `${globalStability * 100}%` }}
              />
            </div>
            <span className="text-[8px] font-mono opacity-50 uppercase mt-1">Harmony Sync</span>
          </div>
          <button 
            onClick={() => setStabilityMode(!stabilityMode)}
            className={`glass px-4 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold tracking-widest transition-all border rounded-full ${stabilityMode ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'hover:bg-neon-green/10 uppercase'}`}
          >
            {stabilityMode ? 'HARMONY: ON' : 'CHECK HARMONY'}
          </button>
        </div>
      </header>

      {/* Main Simulation Viewport */}
      <main className="w-full h-full relative cursor-crosshair flex items-center justify-center p-6 md:p-10 lg:p-20 pt-32 md:pt-20">
        <div className="relative w-full max-w-[800px] aspect-square border border-neon-green/10 bg-black/40 rounded-xl overflow-hidden shadow-2xl">
          <svg 
            viewBox="0 0 1000 1000" 
            className="w-full h-full"
            onMouseLeave={() => setHoveredBlock(null)}
          >
            <defs>
              <linearGradient id="residentialGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#39FF14" />
                <stop offset="100%" stopColor="#1B4D0A" />
              </linearGradient>
              <linearGradient id="commercialGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00F3FF" />
                <stop offset="100%" stopColor="#004A4D" />
              </linearGradient>
              <linearGradient id="industrialGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="100%" stopColor="#4D3D00" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glitch">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>

            {/* Background HUD Grid */}
            <g className="opacity-10 pointer-events-none">
              <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#39FF14" strokeWidth="0.5" />
                <circle cx="0" cy="0" r="1" fill="#39FF14" />
              </pattern>
              <rect width="1000" height="1000" fill="url(#grid)" />
            </g>

            {/* BSP Blocks */}
            {gameState.blocks.map(block => (
              <g key={block.id} filter={(block.corruptedUntil && block.corruptedUntil > gameState.ticks) ? 'url(#glitch)' : ''}>
                <motion.rect
                  x={block.x}
                  y={block.y}
                  width={block.width}
                  height={block.height}
                  fill={block.id === hoveredBlock ? 'rgba(57, 255, 20, 0.05)' : 'transparent'}
                  stroke="currentColor"
                  strokeWidth={block.isLeaf ? 2 : 0.5}
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: 1,
                    stroke: block.id === hoveredBlock || block.id === selectedBlock ? '#39FF14' : 'rgba(57, 255, 20, 0.15)' 
                  }}
                  className="transition-all duration-300"
                  onMouseEnter={() => block.isLeaf && setHoveredBlock(block.id)}
                  onClick={() => block.isLeaf && setSelectedBlock(block.id)}
                />

                {/* HUD Corner Accents */}
                {block.isLeaf && block.id === hoveredBlock && (
                  <g className="pointer-events-none">
                    <path d={`M ${block.x} ${block.y + 10} V ${block.y} H ${block.x + 10}`} stroke="#39FF14" fill="none" />
                    <path d={`M ${block.x + block.width} ${block.y + 10} V ${block.y} H ${block.x + block.width - 10}`} stroke="#39FF14" fill="none" />
                    <path d={`M ${block.x} ${block.y + block.height - 10} V ${block.y + block.height} H ${block.x + 10}`} stroke="#39FF14" fill="none" />
                    <path d={`M ${block.x + block.width} ${block.y + block.height - 10} V ${block.y + block.height} H ${block.x + block.width - 10}`} stroke="#39FF14" fill="none" />
                    <text 
                      x={block.x + 5} 
                      y={block.y + block.height - 5} 
                      fontSize="8" 
                      className="font-mono fill-neon-green/50"
                    >
                      SEC_{block.id.slice(0, 4)} :: {Math.floor(block.x)}/{Math.floor(block.y)}
                    </text>
                  </g>
                )}
                
                {/* Visual Indicators for Block Types */}
                {block.isLeaf && (
                  <g transform={`translate(${block.x + block.width - 20}, ${block.y + 10})`} className="opacity-40">
                    {block.type === 'Residential' ? (
                      <Home size={12} strokeWidth={2} />
                    ) : block.type === 'Commercial' ? (
                      <ShoppingBag size={12} strokeWidth={2} />
                    ) : (
                      <Building2 size={12} strokeWidth={2} />
                    )}
                  </g>
                )}
                
                {/* Procedural Buildings */}
                {block.isLeaf && (
                  <ProceduralBuilding 
                    block={block} 
                    ticks={gameState.ticks} 
                    isHovered={hoveredBlock === block.id} 
                  />
                )}
              </g>
            ))}

            {/* Stability Matching Lines */}
            {stabilityMode && Object.entries(matches).map(([hId, jId]) => {
              const hNode = gameState.nodes.find(n => n.id === hId);
              const jNode = gameState.nodes.find(n => n.id === jId);
              if (!hNode || !jNode) return null;
              
              const dist = Math.hypot(hNode.x - jNode.x, hNode.y - jNode.y);
              const isStable = dist < 400;

              return (
                <g key={`match-${hId}`}>
                  <motion.line
                    x1={hNode.x}
                    y1={hNode.y}
                    x2={jNode.x}
                    y2={jNode.y}
                    stroke={isStable ? '#00F3FF' : '#FF3131'}
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    initial={{ opacity: 0 }}
                    animate={!isStable ? {
                      x: [0, -2, 2, -1, 0],
                      y: [0, 1, -1, 2, 0],
                      opacity: [0.4, 0.8, 0.4]
                    } : {
                      opacity: 0.4
                    }}
                    transition={!isStable ? {
                      duration: 0.2,
                      repeat: Infinity,
                    } : {
                      duration: 0.5
                    }}
                  />
                  {!isStable && (
                    <motion.circle
                      cx={hNode.x}
                      cy={hNode.y}
                      r="10"
                      fill="none"
                      stroke="#FF3131"
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          <canvas 
            ref={canvasRef}
            width={1000}
            height={1000}
            className="absolute top-0 left-0 w-full h-full pointer-events-none mix-blend-screen"
          />
          {/* Decorative Terminal Log */}
          <div className="absolute bottom-4 left-4 font-mono text-[8px] text-neon-green/30 pointer-events-none space-y-0.5 uppercase">
            <div>&gt; TRK_DRN: {gameState.drones.length}</div>
            <div>&gt; SYS_STR: {(globalStability * 100).toFixed(1)}%</div>
            <div>&gt; VIR_ACT: {gameState.viruses.length > 0 ? "WARNING" : "NOMINAL"}</div>
            <div className="animate-pulse">&gt; SYS_TIME: {Math.floor(gameState.ticks / 60)}s</div>
          </div>
        </div>
      </main>

      {/* Right Details Sidebar */}
      <AnimatePresence>
        {selectedBlock && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute right-0 top-0 h-full w-full md:w-80 glass z-[60] p-6 md:p-8 flex flex-col gap-8 shadow-2xl"
          >
            <div className="flex justify-between items-start">
              <h2 className="text-3xl font-bold tracking-tight">DISTRICT</h2>
              <button 
                onClick={() => setSelectedBlock(null)} 
                className="w-8 h-8 rounded-full border border-neon-green/20 flex items-center justify-center hover:bg-neon-green/20 transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3">
                <div className="flex justify-between items-center text-xs uppercase tracking-widest opacity-50">
                  <span>Type</span>
                  <span className="text-neon-cyan font-bold">
                    {gameState.blocks.find(b => b.id === selectedBlock)?.type === 'Residential' ? 'Housing' : 'Business'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs uppercase tracking-widest opacity-50">
                  <span>Complexity</span>
                  <span className="text-white font-bold">{gameState.blocks.find(b => b.id === selectedBlock)?.level}</span>
                </div>
              </div>
            </div>

            <div className="mt-auto space-y-3">
              <button 
                onClick={handleRefactor}
                disabled={gameState.credits < 10}
                className="w-full bg-neon-green text-black font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-tighter"
              >
                <RefreshCcw className="w-5 h-5" />
                Divide District (10 Energy)
              </button>
              <p className="text-[10px] text-center opacity-40 uppercase tracking-widest">Growth requires energy</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Footer Navigation */}
      <footer className="absolute bottom-0 left-0 w-full p-6 flex justify-between items-center pointer-events-none">
        <div className="flex gap-6 pointer-events-auto items-center">
          <div className="w-3 h-3 bg-neon-green rounded-full animate-ping" />
          <div className="flex flex-col">
            <span className="text-[10px] opacity-40 uppercase tracking-widest">Blueprint</span>
            <span className="text-sm font-bold">{gameState.seed}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest opacity-60">
             <MousePointer2 className="w-4 h-4" /> CLICK TO INSPECT
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProceduralBuilding({ block, ticks, isHovered }: { block: Block, ticks: number, isHovered: boolean }) {
  const isCorrupted = block.corruptedUntil && block.corruptedUntil > ticks;
  const isResidential = block.type === 'Residential';
  const isCommercial = block.type === 'Commercial';
  const isIndustrial = block.type === 'Industrial';

  // Seeded randomization for consistency per block
  const rng = useMemo(() => mulberry32(parseInt(block.id.slice(0, 5), 36)), [block.id]);
  const buildingWidth = block.width * 0.7;
  const buildingHeight = block.height * (isIndustrial ? 0.9 : 0.7);
  const centerX = block.x + block.width / 2;
  const bottomY = block.y + block.height - 5;

  const components = useMemo(() => {
    const parts: React.ReactNode[] = [];
    
    if (isResidential) {
      const floors = Math.floor(rng() * 3) + 2;
      const floorHeight = buildingHeight / floors;
      for (let i = 0; i < floors; i++) {
        const w = buildingWidth * (1 - i * 0.1);
        parts.push(
          <rect 
            key={`res-${i}`}
            x={centerX - w / 2}
            y={bottomY - (i + 1) * floorHeight}
            width={w}
            height={floorHeight}
          />
        );
        // Windows
        const windows = 3;
        for (let j = 0; j < windows; j++) {
          parts.push(
            <rect 
              key={`res-win-${i}-${j}`}
              x={centerX - w/2 + (j + 0.5) * (w/windows) - 1}
              y={bottomY - (i + 1) * floorHeight + floorHeight/2 - 1}
              width="2"
              height="2"
              fill="rgba(57, 255, 20, 0.4)"
            />
          );
        }
      }
    } else if (isCommercial) {
      const baseWidth = buildingWidth;
      const baseHeight = buildingHeight * 0.4;
      parts.push(
        <rect 
          key="comm-base"
          x={centerX - baseWidth / 2}
          y={bottomY - baseHeight}
          width={baseWidth}
          height={baseHeight}
        />
      );
      const topWidth = baseWidth * 0.6;
      const topHeight = buildingHeight * 0.4;
      parts.push(
        <rect 
          key="comm-top"
          x={centerX - topWidth / 2}
          y={bottomY - baseHeight - topHeight}
          width={topWidth}
          height={topHeight}
        />
      );
      // Advertising sign / glowing band
      parts.push(
        <rect 
          key="comm-sign"
          x={centerX - topWidth / 2 - 2}
          y={bottomY - baseHeight - topHeight}
          width={topWidth + 4}
          height="4"
          fill="rgba(0, 243, 255, 0.8)"
        />
      );
    } else if (isIndustrial) {
      const segments = 4;
      const segHeight = buildingHeight / segments;
      for (let i = 0; i < segments; i++) {
        const sw = buildingWidth * 0.4;
        parts.push(
          <rect 
            key={`ind-${i}`}
            x={centerX - sw / 2}
            y={bottomY - (i + 1) * segHeight}
            width={sw}
            height={segHeight - 2}
          />
        );
        // Side modules
        if (i < 2) {
          const mw = sw * 0.5;
          const side = i % 2 === 0 ? 1 : -1;
          parts.push(
            <rect 
              key={`ind-mod-${i}`}
              x={centerX + (side * sw/2) - (side === -1 ? mw : 0)}
              y={bottomY - (i + 0.8) * segHeight}
              width={mw}
              height={segHeight * 0.4}
            />
          );
        }
      }
      // Needle Antenna
      parts.push(
        <line 
          key="antenna"
          x1={centerX}
          y1={bottomY - buildingHeight}
          x2={centerX}
          y2={bottomY - buildingHeight - 15}
          strokeWidth="1"
        />
      );
    }

    return parts;
  }, [isResidential, isCommercial, isIndustrial, buildingWidth, buildingHeight, centerX, bottomY, rng]);

  const color = isCorrupted ? '#FF3131' : 
                (isIndustrial ? 'url(#industrialGradient)' : 
                (isCommercial ? 'url(#commercialGradient)' : 'url(#residentialGradient)'));

  return (
    <motion.g
      filter="url(#glow)"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={isCorrupted ? {
        opacity: 0.2,
        fill: '#FF3131',
        stroke: '#FF3131',
        scale: 1,
      } : { 
        opacity: isHovered ? 1 : 0.8,
        scale: 1,
        fill: color,
        stroke: color
      }}
      transition={{ duration: 0.5 }}
      style={{ 
        strokeWidth: isCorrupted ? 2 : 1,
        pointerEvents: isCorrupted ? 'none' : 'auto'
      }}
    >
      {components}
    </motion.g>
  );
}
