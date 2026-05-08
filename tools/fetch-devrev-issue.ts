/**
 * Fetch a DevRev issue (title, description, comments) and extract
 * component migration discrepancies or usages data.
 *
 * Usage:
 *   DEVREV_TOKEN=<your-pat> npx tsx tools/fetch-devrev-issue.ts ISS-12345
 *
 * Or from the skill, call this programmatically:
 *   import { fetchIssueContext } from './fetch-devrev-issue';
 *   const context = await fetchIssueContext('ISS-12345');
 *
 * Returns structured data:
 *   - title
 *   - description (body markdown)
 *   - comments (timeline entries of type 'comment')
 *   - combined text (all of the above concatenated for parsing)
 */

const BASE_URL = 'https://api.devrev.ai';

function getToken(): string {
  const token =
    process.env.DEVREV_APP_PAT ||
    process.env.DEVREV_PAT ||
    process.env.DEVREV_TOKEN ||
    process.env.DEVREV_SVC_ACC_TOKEN;
  if (!token) {
    throw new Error(
      'No DevRev token found. Set one of: DEVREV_APP_PAT, DEVREV_PAT, DEVREV_TOKEN, or DEVREV_SVC_ACC_TOKEN'
    );
  }
  return token;
}

async function devrevPost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DevRev API ${endpoint} failed (${res.status}): ${text}`);
  }

  return res.json();
}

export interface IssueContext {
  id: string;
  title: string;
  description: string;
  comments: string[];
  combinedText: string;
}

export async function fetchIssueContext(issueId: string): Promise<IssueContext> {
  // Normalize: accept "ISS-12345" or full DON ID
  const id = issueId.startsWith('don:') ? issueId : issueId;

  // Step 1: Get the work item
  const workRes = await devrevPost('works.get', { id });
  const work = workRes.work;

  if (!work) {
    throw new Error(`Issue ${issueId} not found`);
  }

  const title = work.title || '';
  const description = work.body || '';
  const donId = work.id; // Full DON ID for timeline query

  // Step 2: Get timeline entries (comments)
  let comments: string[] = [];
  try {
    const timelineRes = await devrevPost('timeline-entries.list', {
      object: donId,
      type: ['timeline_comment'],
      limit: 50,
    });

    if (timelineRes.timeline_entries) {
      comments = timelineRes.timeline_entries
        .filter((entry: any) => entry.body)
        .map((entry: any) => entry.body)
        .reverse(); // Chronological order
    }
  } catch (e) {
    // Timeline might fail for permissions — continue without comments
    console.warn(`Could not fetch comments for ${issueId}: ${(e as Error).message}`);
  }

  const combinedText = [
    `# ${title}`,
    '',
    description,
    '',
    ...comments.map((c, i) => `## Comment ${i + 1}\n${c}`),
  ].join('\n');

  return { id: donId, title, description, comments, combinedText };
}

// ─── CLI entrypoint ───
if (require.main === module) {
  const issueId = process.argv[2];
  if (!issueId) {
    console.error('Usage: DEVREV_TOKEN=<token> npx tsx tools/fetch-devrev-issue.ts ISS-12345');
    process.exit(1);
  }

  fetchIssueContext(issueId)
    .then((ctx) => {
      console.log(JSON.stringify(ctx, null, 2));
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
