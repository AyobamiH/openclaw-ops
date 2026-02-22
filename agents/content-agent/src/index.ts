import * as fs from 'fs';
import * as path from 'path';

interface Task { id: string; type: string; source: any; style?: string; length?: string; }
interface Result { success: boolean; content: string; metrics: any; executionTime: number; }

function loadConfig(): any {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../agent.config.json'), 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  if (!canUseSkill('documentParser')) {
    return { success: false, content: '', metrics: {}, executionTime: Date.now() - startTime };
  }

  try {
    let content = '';
    let wordCount = 0;

    switch (task.type) {
      case 'readme':
        content = generateREADME(task.source);
        break;
      case 'api_docs':
        content = generateAPIDocs(task.source);
        break;
      case 'changelog':
        content = generateChangelog(task.source);
        break;
      case 'blog_post':
        content = generateBlogPost(task.source);
        break;
      default:
        content = generateREADME(task.source);
    }

    wordCount = content.split(/\s+/).length;

    return {
      success: true,
      content,
      metrics: {
        generatedType: task.type,
        wordCount,
        estimatedReadTime: Math.ceil(wordCount / 200) + ' min',
        sections: content.split('##').length - 1,
        codeExamples: (content.match(/```/g) || []).length / 2,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, content: '', metrics: {}, executionTime: Date.now() - startTime };
  }
}

function generateREADME(source: any): string {
  return `# ${source.name || 'Project'}

## Overview
${source.description || 'A high-quality project.'}

## Installation
\`\`\`bash
npm install ${source.name}
\`\`\`

## Features
- Feature 1
- Feature 2
- Feature 3

## Quick Start
\`\`\`javascript
const ${source.name} = require('${source.name}');
\`\`\`

## Documentation
See [docs](./docs) for detailed information.

## License
MIT
`;
}

function generateAPIDocs(source: any): string {
  return `# API Documentation

## Endpoints

### GET /api/resource
Retrieve a resource.

**Parameters:**
- id (required): Resource ID

**Response:**
\`\`\`json
{ "id": "...", "data": "..." }
\`\`\`

**Status Codes:**
- 200: Success
- 404: Not found
- 500: Server error
`;
}

function generateChangelog(source: any): string {
  return `# Changelog

## [1.0.0] - 2024-02-22

### Added
- New feature 1
- New feature 2

### Fixed
- Bug fix 1
- Bug fix 2

### Changed
- Breaking change description
`;
}

function generateBlogPost(source: any): string {
  return `# ${source.title || 'Technical Deep Dive'}

By Author | ${new Date().toLocaleDateString()}

## Introduction
This post explores [topic]. We'll cover basics, advanced patterns, and real-world examples.

## The Problem
[Context and motivation]

## The Solution
[Technical approach]

\`\`\`code
// Example code
\`\`\`

## Conclusion
[Recap and next steps]

## Further Reading
- Reference 1
- Reference 2
`;
}

export { handleTask, loadConfig, canUseSkill };
