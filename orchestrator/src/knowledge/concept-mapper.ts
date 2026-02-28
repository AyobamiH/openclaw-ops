/**
 * Concept Mapper - Links related insights across days
 * Creates a semantic network of patterns and solutions
 */

export interface Concept {
  id: string;
  name: string;
  type: 'root_cause' | 'metric' | 'solution' | 'pattern';
  description: string;
  relatedConcepts: string[];
  frequency: number;
  firstSeen: number;
  lastSeen: number;
}

export interface ConceptLink {
  fromId: string;
  toId: string;
  relationship:
    | 'causes'
    | 'solved_by'
    | 'related_to'
    | 'precedes'
    | 'follows'
    | 'indicates';
  strength: number; // 0-1
  evidence: string[]; // References to consolidation dates
}

export class ConceptMapper {
  private concepts: Map<string, Concept> = new Map();
  private links: Map<string, ConceptLink> = new Map();

  /**
   * Extract concepts from consolidation
   */
  extractConcepts(consolidation: any, date: string): Concept[] {
    const extracted: Concept[] = [];

    // Root causes (from insights)
    if (consolidation.insights && Array.isArray(consolidation.insights)) {
      consolidation.insights.forEach((insight: string) => {
        const concept = this.createOrUpdateConcept(
          insight,
          'root_cause',
          insight,
          date
        );
        extracted.push(concept);
      });
    }

    // Metrics (from patterns)
    if (consolidation.patterns) {
      const metrics = Object.entries(consolidation.patterns).map(
        ([key, value]) => `${key}:${value}`
      );
      metrics.forEach(metric => {
        const concept = this.createOrUpdateConcept(metric, 'metric', metric, date);
        extracted.push(concept);
      });
    }

    // Solutions (from recommendations)
    if (consolidation.recommendations && Array.isArray(consolidation.recommendations)) {
      consolidation.recommendations.forEach((rec: any) => {
        const concept = this.createOrUpdateConcept(
          rec.action || rec,
          'solution',
          rec.description || rec,
          date
        );
        extracted.push(concept);
      });
    }

    return extracted;
  }

  /**
   * Create or update concept
   */
  private createOrUpdateConcept(
    name: string,
    type: Concept['type'],
    description: string,
    date: string
  ): Concept {
    const id = this.hashConcept(name);

    if (this.concepts.has(id)) {
      const concept = this.concepts.get(id)!;
      concept.frequency++;
      concept.lastSeen = Date.now();
      return concept;
    }

    const concept: Concept = {
      id,
      name,
      type,
      description,
      relatedConcepts: [],
      frequency: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    this.concepts.set(id, concept);
    return concept;
  }

  /**
   * Link concepts from the same consolidation
   */
  linkConcepts(
    fromConcept: Concept,
    toConcept: Concept,
    relationship: ConceptLink['relationship'],
    consolidationDate: string
  ): void {
    const linkId = `${fromConcept.id}→${toConcept.id}:${relationship}`;

    if (this.links.has(linkId)) {
      const link = this.links.get(linkId)!;
      link.strength = Math.min(link.strength + 0.1, 1);
      link.evidence.push(consolidationDate);
    } else {
      const link: ConceptLink = {
        fromId: fromConcept.id,
        toId: toConcept.id,
        relationship,
        strength: 0.5,
        evidence: [consolidationDate],
      };
      this.links.set(linkId, link);

      // Update related concepts
      if (!fromConcept.relatedConcepts.includes(toConcept.id)) {
        fromConcept.relatedConcepts.push(toConcept.id);
      }
      if (!toConcept.relatedConcepts.includes(fromConcept.id)) {
        toConcept.relatedConcepts.push(fromConcept.id);
      }
    }
  }

  /**
   * Build causal chain for a concept
   */
  getCausalChain(conceptId: string, depth = 3): { forward: Concept[]; backward: Concept[] } {
    const forward: Concept[] = [];
    const backward: Concept[] = [];

    let currentLevel = [conceptId];
    for (let i = 0; i < depth; i++) {
      const nextLevel: string[] = [];

      for (const id of currentLevel) {
        // Find "causes" relationships
        this.links.forEach(link => {
          if (link.fromId === id && link.relationship === 'causes') {
            const concept = this.concepts.get(link.toId);
            if (concept && !forward.some(c => c.id === concept.id)) {
              forward.push(concept);
              nextLevel.push(link.toId);
            }
          }
          // Find "caused_by" relationships
          if (link.toId === id && link.relationship === 'causes') {
            const concept = this.concepts.get(link.fromId);
            if (concept && !backward.some(c => c.id === concept.id)) {
              backward.push(concept);
              nextLevel.push(link.fromId);
            }
          }
        });
      }

      currentLevel = nextLevel;
    }

    return { forward, backward };
  }

  /**
   * Get solution path for a problem
   */
  getSolutionPath(problemId: string): Concept[] {
    const chain = this.getCausalChain(problemId, 2);
    const problem = this.concepts.get(problemId);

    // Find solutions that "solve" this problem
    const solutions: Concept[] = [];
    this.links.forEach(link => {
      if (link.fromId === problemId && link.relationship === 'solved_by') {
        const solution = this.concepts.get(link.toId);
        if (solution) solutions.push(solution);
      }
    });

    return solutions;
  }

  /**
   * Get all concepts of a type
   */
  getConceptsByType(
    type: Concept['type'],
    limit = 10
  ): Concept[] {
    return Array.from(this.concepts.values())
      .filter(c => c.type === type)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Get concept network statistics
   */
  getNetworkStats(): {
    totalConcepts: number;
    totalLinks: number;
    avgConnectivity: number;
    mostConnected: Concept[];
    densestAreas: string[];
  } {
    const stats = {
      totalConcepts: this.concepts.size,
      totalLinks: this.links.size,
      avgConnectivity: 0,
      mostConnected: [] as Concept[],
      densestAreas: [] as string[],
    };

    // Calculate average connectivity
    let totalConnections = 0;
    this.concepts.forEach(concept => {
      totalConnections += concept.relatedConcepts.length;
    });
    stats.avgConnectivity =
      this.concepts.size > 0 ? totalConnections / this.concepts.size : 0;

    // Most connected concepts
    stats.mostConnected = Array.from(this.concepts.values())
      .sort((a, b) => b.relatedConcepts.length - a.relatedConcepts.length)
      .slice(0, 5);

    // Find densest areas (groups of highly interconnected concepts)
    const clusters = this.findClusters();
    stats.densestAreas = clusters.map(
      cluster =>
        `${cluster.concepts.length} concepts: ${cluster.concepts
          .map(c => c.name)
          .join(', ')}`
    );

    return stats;
  }

  /**
   * Find clusters of related concepts (simple approach)
   */
  private findClusters(): { concepts: Concept[]; density: number }[] {
    const clusters: { concepts: Concept[]; density: number }[] = [];
    const visited = new Set<string>();

    for (const concept of this.concepts.values()) {
      if (visited.has(concept.id)) continue;

      // BFS to find connected component
      const cluster: Concept[] = [];
      const queue = [concept.id];
      visited.add(concept.id);

      while (queue.length > 0) {
        const id = queue.shift()!;
        const c = this.concepts.get(id)!;
        cluster.push(c);

        for (const relatedId of c.relatedConcepts) {
          if (!visited.has(relatedId)) {
            visited.add(relatedId);
            queue.push(relatedId);
          }
        }
      }

      if (cluster.length > 1) {
        // Calculate cluster density
        let connections = 0;
        cluster.forEach(c => {
          connections += c.relatedConcepts.filter(id =>
            cluster.some(other => other.id === id)
          ).length;
        });
        const maxConnections = cluster.length * (cluster.length - 1);
        const density =
          maxConnections > 0 ? connections / maxConnections : 0;

        clusters.push({ concepts: cluster, density });
      }
    }

    return clusters.sort((a, b) => b.density - a.density);
  }

  /**
   * Export concept map as text graph
   */
  exportAsGraph(): string {
    let output = 'Concept Network Graph\n';
    output += `Nodes: ${this.concepts.size} | Edges: ${this.links.size}\n\n`;

    const clusters = this.findClusters();
    clusters.slice(0, 5).forEach(cluster => {
      output += `Cluster (density: ${cluster.density.toFixed(2)}):\n`;
      cluster.concepts.forEach(c => {
        output += `  [${c.type}] ${c.name} (${c.frequency}x)\n`;
      });
      output += '\n';
    });

    return output;
  }

  /**
   * Hash concept name
   */
  private hashConcept(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').substring(0, 50);
  }
}

export const conceptMapper = new ConceptMapper();
