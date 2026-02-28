import * as fs from 'fs';
import * as path from 'path';

interface AgentConfig { id: string; name: string; model: string; permissions: any; }
interface SecurityTask { id: string; type: 'scan' | 'compliance' | 'incident' | 'secrets'; scope: string; }
interface SecurityResult {
  success: boolean;
  findings: Array<{
    id: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    cwe?: string;
    cvss?: number;
    description: string;
    location: string;
    remediation: string;
  }>;
  summary: { total: number; critical: number; exploitable: boolean; compliance: string }
  executionTime: number;
}

function loadConfig(): AgentConfig {
  const configPath = path.join(__dirname, '../agent.config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: SecurityTask): Promise<SecurityResult> {
  const startTime = Date.now();

  try {
    if (!canUseSkill('documentParser')) {
      return {
        success: false,
        findings: [],
        summary: { total: 0, critical: 0, exploitable: false, compliance: 'UNKNOWN' },
        executionTime: Date.now() - startTime,
      };
    }

    const findings: any[] = [];

    // Simulated security scan
    if (task.type === 'scan') {
      findings.push({
        id: 'sql-inj-001',
        severity: 'CRITICAL',
        cwe: 'CWE-89',
        cvss: 9.8,
        description: 'SQL Injection vulnerability in user lookup',
        location: 'src/database.ts:87',
        remediation: 'Use parameterized queries: db.query($1, $2) instead of template literals',
      });
    } else if (task.type === 'secrets') {
      findings.push({
        id: 'secret-001',
        severity: 'CRITICAL',
        description: 'AWS API key exposed in .env.example',
        location: '.env.example:5',
        remediation: 'Remove credential, rotate key, use AWS Secrets Manager',
      });
    }

    return {
      success: true,
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'CRITICAL').length,
        exploitable: findings.some(f => f.cvss >= 8.0),
        compliance: findings.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      findings: [],
      summary: { total: 0, critical: 0, exploitable: false, compliance: 'ERROR' },
      executionTime: Date.now() - startTime,
    };
  }
}

export { handleTask, loadConfig, canUseSkill };

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  const raw = fs.readFileSync(payloadPath, 'utf-8');
  const payload = JSON.parse(raw) as SecurityTask;
  const result = await handleTask(payload);

  const resultFile = process.env.SECURITY_AGENT_RESULT_FILE;
  if (resultFile) {
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8');
  } else {
    process.stdout.write(JSON.stringify(result));
  }
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
