"""
GitHub Integration Module for verifying predicted files
Install: pip install PyGithub
"""

from github import Github, GithubException, RateLimitExceededException
import time
from typing import List, Dict, Optional
import re


class GitHubVerifier:
    """
    Verifies predicted file paths against a GitHub repository
    """
    
    def __init__(self, github_token: str):
        """
        Initialize GitHub client with authentication token
        
        Args:
            github_token: Personal access token for GitHub API
        """
        self.client = Github(github_token)
        self.rate_limit_remaining = None
        
    def verify_files(
        self, 
        repo_name: str, 
        file_paths: List[str],
        branch: str = "main"
    ) -> Dict:
        """
        Verify if predicted files exist in the repository
        
        Args:
            repo_name: Repository in format "owner/repo"
            file_paths: List of file paths to verify
            branch: Branch name to check (default: "main")
            
        Returns:
            Dictionary with verified_files, missing_files, and suggestions
        """
        try:
            repo = self.client.get_repo(repo_name)
            
            # Check rate limit
            rate_limit = self.client.get_rate_limit()
            self.rate_limit_remaining = rate_limit.core.remaining
            
            if self.rate_limit_remaining < 10:
                raise Exception(f"GitHub API rate limit low: {self.rate_limit_remaining} requests remaining")
            
            verified_files = []
            missing_files = []
            
            for file_path in file_paths:
                result = self._verify_single_file(repo, file_path, branch)
                
                if result['exists']:
                    verified_files.append(result)
                else:
                    missing_files.append(result)
                
                # Add small delay to avoid hitting rate limits
                time.sleep(0.1)
            
            # Try to find similar files for missing ones
            for missing in missing_files:
                suggestions = self._find_similar_files(repo, missing['path'], branch)
                missing['suggestions'] = suggestions
            
            verification_rate = len(verified_files) / len(file_paths) if file_paths else 0
            
            return {
                'verified_files': verified_files,
                'missing_files': missing_files,
                'verification_rate': verification_rate,
                'total_checked': len(file_paths),
                'rate_limit_remaining': self.rate_limit_remaining
            }
            
        except RateLimitExceededException:
            raise Exception("GitHub API rate limit exceeded. Please try again later.")
        except GithubException as e:
            if e.status == 404:
                raise Exception(f"Repository '{repo_name}' not found or you don't have access")
            raise Exception(f"GitHub API error: {e.data.get('message', str(e))}")
        except Exception as e:
            raise Exception(f"Verification failed: {str(e)}")
    
    def _verify_single_file(
        self, 
        repo, 
        file_path: str, 
        branch: str
    ) -> Dict:
        """
        Verify a single file exists in the repository
        """
        try:
            content = repo.get_contents(file_path, ref=branch)
            
            return {
                'path': file_path,
                'exists': True,
                'url': content.html_url,
                'size': content.size,
                'last_modified': content.last_modified if hasattr(content, 'last_modified') else None
            }
        except GithubException as e:
            if e.status == 404:
                return {
                    'path': file_path,
                    'exists': False,
                    'reason': 'File not found'
                }
            return {
                'path': file_path,
                'exists': False,
                'reason': f'Error: {e.data.get("message", "Unknown error")}'
            }
    
    def _find_similar_files(
        self, 
        repo, 
        file_path: str, 
        branch: str,
        max_results: int = 3
    ) -> List[str]:
        """
        Find similar file paths in the repository
        Uses fuzzy matching on filename and directory structure
        """
        try:
            # Extract filename and directory
            parts = file_path.split('/')
            filename = parts[-1]
            filename_base = filename.rsplit('.', 1)[0] if '.' in filename else filename
            
            # Search for files with similar names
            query = f"repo:{repo.full_name} filename:{filename_base}"
            
            try:
                results = self.client.search_code(query)
                similar_files = []
                
                for result in results[:max_results]:
                    similar_files.append(result.path)
                
                return similar_files
            except:
                # If search fails, try checking common directories
                return self._check_common_directories(repo, filename, branch)
                
        except Exception:
            return []
    
    def _check_common_directories(
        self, 
        repo, 
        filename: str, 
        branch: str
    ) -> List[str]:
        """
        Check common directory structures for the file
        """
        common_dirs = [
            'src',
            'app',
            'lib',
            'components',
            'pages',
            'api',
            'services',
            'models',
            'controllers',
            'utils',
            'config'
        ]
        
        found_files = []
        
        for directory in common_dirs:
            try:
                path = f"{directory}/{filename}"
                repo.get_contents(path, ref=branch)
                found_files.append(path)
            except:
                continue
                
            if len(found_files) >= 3:
                break
        
        return found_files
    
    def get_file_content(
        self, 
        repo_name: str, 
        file_path: str,
        branch: str = "main"
    ) -> Optional[str]:
        """
        Get the actual content of a file from the repository
        
        Args:
            repo_name: Repository in format "owner/repo"
            file_path: Path to the file
            branch: Branch name (default: "main")
            
        Returns:
            File content as string, or None if not found
        """
        try:
            repo = self.client.get_repo(repo_name)
            content = repo.get_contents(file_path, ref=branch)
            
            # Decode content from base64
            return content.decoded_content.decode('utf-8')
            
        except GithubException:
            return None
    
    def check_repository_structure(
        self, 
        repo_name: str,
        branch: str = "main"
    ) -> Dict:
        """
        Analyze repository structure to understand project type
        
        Returns:
            Dictionary with project type indicators
        """
        try:
            repo = self.client.get_repo(repo_name)
            
            # Check for common config files
            indicators = {
                'has_package_json': False,
                'has_requirements_txt': False,
                'has_pom_xml': False,
                'has_dockerfile': False,
                'likely_frontend': False,
                'likely_backend': False,
                'likely_fullstack': False
            }
            
            config_files = [
                'package.json',
                'requirements.txt',
                'pom.xml',
                'Dockerfile',
                'docker-compose.yml'
            ]
            
            for file in config_files:
                try:
                    repo.get_contents(file, ref=branch)
                    key = f"has_{file.replace('.', '_').replace('-', '_')}"
                    if key in indicators:
                        indicators[key] = True
                except:
                    pass
            
            # Determine project type
            if indicators['has_package_json']:
                indicators['likely_frontend'] = True
            if indicators['has_requirements_txt'] or indicators['has_pom_xml']:
                indicators['likely_backend'] = True
            if indicators['likely_frontend'] and indicators['likely_backend']:
                indicators['likely_fullstack'] = True
            
            return indicators
            
        except Exception as e:
            return {'error': str(e)}


# Utility function for standalone usage
def verify_predicted_files(
    github_token: str,
    repo_name: str,
    predicted_files: List[str],
    branch: str = "main"
) -> Dict:
    """
    Convenience function to verify files
    
    Usage:
        result = verify_predicted_files(
            github_token="ghp_xxx",
            repo_name="owner/repo",
            predicted_files=["src/app.js", "api/routes.py"]
        )
    """
    verifier = GitHubVerifier(github_token)
    return verifier.verify_files(repo_name, predicted_files, branch)


# Example usage
if __name__ == "__main__":
    import os
    
    # Get token from environment
    token = os.environ.get('GITHUB_TOKEN')
    
    if not token:
        print("Please set GITHUB_TOKEN environment variable")
        exit(1)
    
    # Example verification
    verifier = GitHubVerifier(token)
    
    # Test files
    test_files = [
        "src/components/Dashboard.tsx",
        "api/controllers/userController.js",
        "nonexistent/file.py"
    ]
    
    result = verifier.verify_files(
        repo_name="your-org/your-repo",
        file_paths=test_files
    )
    
    print("\n=== Verification Results ===")
    print(f"Verification Rate: {result['verification_rate']:.1%}")
    print(f"\nVerified Files ({len(result['verified_files'])}):")
    for file in result['verified_files']:
        print(f"  ✓ {file['path']}")
        print(f"    URL: {file['url']}")
    
    print(f"\nMissing Files ({len(result['missing_files'])}):")
    for file in result['missing_files']:
        print(f"  ✗ {file['path']}")
        if file.get('suggestions'):
            print(f"    Suggestions: {', '.join(file['suggestions'])}")
