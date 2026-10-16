import { GitHubVerificationResult, GitHubFileVerification } from '../types';

export const githubService = {
  async verifyFiles(
    repoName: string,
    filePaths: string[],
    branch: string = 'main',
    token?: string
  ): Promise<GitHubVerificationResult> {
    const verifiedFiles: GitHubFileVerification[] = [];
    const missingFiles: GitHubFileVerification[] = [];

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token && token.trim().length > 0) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    let rateLimitRemaining: number | undefined = undefined;

    // Check rate limit first
    try {
      const rateRes = await fetch('https://api.github.com/rate_limit', { headers });
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        rateLimitRemaining = rateData.resources?.core?.remaining;
      }
    } catch {
      // ignore network errors on rate limit endpoint
    }

    const cleanRepo = repoName.trim();
    const [owner, repo] = cleanRepo.split('/');

    if (!owner || !repo) {
      throw new Error(`Invalid repository format "${repoName}". Expected "owner/repo" (e.g. facebook/react)`);
    }

    // Verify each file against real GitHub REST API
    for (const filePath of filePaths) {
      const cleanPath = filePath.trim();
      if (!cleanPath) continue;

      try {
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`;
        const res = await fetch(url, { headers });

        if (res.ok) {
          const data = await res.json();
          verifiedFiles.push({
            path: cleanPath,
            exists: true,
            url: data.html_url || `https://github.com/${cleanRepo}/blob/${branch}/${cleanPath}`,
            size: data.size,
            last_modified: new Date().toISOString(),
          });
        } else if (res.status === 404) {
          const suggestions = generateSuggestions(cleanPath);
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: `File not found in branch "${branch}"`,
            suggestions,
          });
        } else if (res.status === 403 || res.status === 429) {
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: 'GitHub API rate limit exceeded or access forbidden',
          });
        } else {
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: `GitHub API error (HTTP ${res.status})`,
          });
        }
      } catch (err: any) {
        missingFiles.push({
          path: cleanPath,
          exists: false,
          reason: `Network error verifying file: ${err?.message || 'Failed to fetch'}`,
          suggestions: generateSuggestions(cleanPath),
        });
      }
    }

    const total = verifiedFiles.length + missingFiles.length;
    const verificationRate = total > 0 ? verifiedFiles.length / total : 0;

    return {
      repoName: cleanRepo,
      branch,
      verifiedFiles,
      missingFiles,
      verificationRate: Math.round(verificationRate * 100) / 100,
      totalChecked: total,
      rateLimitRemaining: rateLimitRemaining ?? 60,
      checkedAt: new Date().toISOString(),
    };
  },

  async analyzeRepoStructure(repoName: string, branch: string = 'main', token?: string) {
    const cleanRepo = repoName.trim();
    const [owner, repo] = cleanRepo.split('/');
    if (!owner || !repo) {
      return {
        likelyFrontend: false,
        likelyBackend: false,
        likelyFullstack: false,
        detectedFiles: [],
      };
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token && token.trim().length > 0) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    const commonFiles = [
      'package.json',
      'tsconfig.json',
      'requirements.txt',
      'Dockerfile',
      'docker-compose.yml',
      'pom.xml',
      'go.mod',
      'Cargo.toml',
      'README.md',
    ];

    const detectedFiles: string[] = [];

    // Query real repository contents from GitHub
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const contents = await res.json();
        if (Array.isArray(contents)) {
          const names = new Set(contents.map((item: any) => item.name));
          for (const cf of commonFiles) {
            if (names.has(cf)) {
              detectedFiles.push(cf);
            }
          }
        }
      }
    } catch {
      // fallback
    }

    const hasPackageJson = detectedFiles.includes('package.json');
    const hasPythonOrJava =
      detectedFiles.includes('requirements.txt') ||
      detectedFiles.includes('pom.xml') ||
      detectedFiles.includes('go.mod');
    const hasDocker = detectedFiles.includes('Dockerfile') || detectedFiles.includes('docker-compose.yml');

    return {
      likelyFrontend: hasPackageJson,
      likelyBackend: hasPythonOrJava || (hasPackageJson && hasDocker),
      likelyFullstack: hasPackageJson && (hasPythonOrJava || hasDocker),
      detectedFiles,
    };
  },
};

function generateSuggestions(filePath: string): string[] {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1];
  const commonDirs = ['src', 'app', 'components', 'pages', 'api', 'services', 'models', 'utils'];

  return commonDirs
    .slice(0, 3)
    .map((dir) => `${dir}/${filename}`)
    .filter((s) => s !== filePath);
}
