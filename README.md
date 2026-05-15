# 🏙️ SUDO-CITY

**SUDO-CITY** is a procedural urban simulation engine that explores the intersection of algorithmic growth and economic sustainability. In this simulation, the city is not just a static map, but a dynamic organism evolving through multi-layered mathematical models.

---

## 🛠️ Technical Architecture

### 1. Urban Partitioning: Binary Space Partitioning (BSP)
The city grid is generated using a **Binary Space Partitioning** algorithm. 
- **The Process:** Starting with a root "Infrastructure" block, the space is recursively divided either vertically or horizontally.
- **The Heuristic:** Divisions are constrained by a `MIN_BLOCK_SIZE` to ensure functional district sizes.
- **The Logic:** Smaller blocks (leaves of the BSP tree) are assigned different roles—**Residential**, **Commercial**, or **Industrial**—based on their level in the tree and seeded randomization.

### 2. Emerging Routes: Ant Colony Optimization (ACO)
Pathfinding for the city's drone labor force is handled by a simplified **Ant Colony Optimization** model.
- **Pheromone Trails:** Drones move between nodes (hubs) following edges. Successful deliveries reinforce those edges with "pheromones".
- **Decay & Heuristics:** Pheromones decay over time, preventing stagnant routes. Drones select their next node based on a probabilistic combination of pheromone strength ($\tau$) and a distance-to-target heuristic ($\eta$).
- **Efficiency:** This emerges as a natural traffic flow system where drones cluster around high-traffic delivery corridors without centralized control.

### 3. Social Cohesion: Gale-Shapley Algorithm
The "Urban Harmony" score is calculated using the **Stable Marriage** algorithm.
- **Preferences:** Residential districts (Homes) prefer the closest valid Business districts (Jobs), and vice versa.
- **Matching:** The simulation runs a Gale-Shapley pass to find the most optimal matching set for the entire city.
- **Harmony:** If the average distance between matched pairs is within the "Commute Threshold" (400 units), the city's stability increases.

### 4. Generative Architecture: L-Systems
Buildings within each district are procedurally generated using **Lindenmayer Systems**.
- **Rules:** Each district has a unique L-System axiom and rewrite rules (e.g., `F -> F[+F]F[-F]F`).
- **Visuals:** These strings are interpreted into different architectural styles. **Industrial** sectors utilize taller, more rigid branching, while **Residential** sectors use more compact, clustered geometries.

---

## 🕹️ Game Mechanics

- **Maintenance Cost:** Every district added to the grid increases the simulation's energy drain.
- **Drone Economy:** Drones are the primary source of income (+10 Energy per delivery).
- **Refactoring:** You can spend Energy to "Divide District", triggering a new BSP subdivision and potentially creating more efficient (but higher maintenance) urban modules.
- **Threats:** Digital Viruses interfere with drone pathfinding and "corrupt" sectors, disabling their contribution to Harmony until the system purges them.

---

## 🚀 Vision
SUDO-CITY aims to visualize the "Ghost in the Machine" of modern urbanism—where the city is built by logic, matched by preference, and optimized by collective behavior.

---

*Built with React, Motion, and Procedural Logic.*
