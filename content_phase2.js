// API Configuration
const API_URL = 'http://localhost:5000/analyze';

// Create and inject the analyze button
function injectAnalyzeButton() {
  if (document.getElementById('jira-analyzer-btn')) return;

  const headerArea = document.querySelector('[data-test-id="issue.views.issue-base.foundation.summary.heading"]') ||
                     document.querySelector('h1[data-test-id]') ||
                     document.querySelector('#summary-val');
  
  if (!headerArea) {
    setTimeout(injectAnalyzeButton, 1000);
    return;
  }

  const button = document.createElement('button');
  button.id = 'jira-analyzer-btn';
  button.className = 'jira-analyzer-button';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M2 10L8 14L14 10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>
    Analyze Files
  `;
  
  button.addEventListener('click', handleAnalyzeClick);
  
  const container = headerArea.parentElement;
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '12px';
  container.appendChild(button);
}

function extractTicketDescription() {
  const descriptionElement = 
    document.querySelector('[data-test-id="issue.views.field.rich-text.description"]') ||
    document.querySelector('.user-content-block') ||
    document.querySelector('#description-val') ||
    document.querySelector('.description');
  
  if (!descriptionElement) {
    throw new Error('Could not find ticket description');
  }

  const titleElement = document.querySelector('[data-test-id="issue.views.issue-base.foundation.summary.heading"]') ||
                       document.querySelector('#summary-val');
  const title = titleElement ? titleElement.textContent.trim() : '';
  
  const ticketKey = window.location.pathname.split('/').pop();
  const description = descriptionElement.textContent.trim();
  
  return {
    ticketKey,
    title,
    description,
    fullText: `${title}\n\n${description}`
  };
}

async function handleAnalyzeClick(e) {
  e.preventDefault();
  
  const button = e.currentTarget;
  const originalContent = button.innerHTML;
  
  try {
    button.disabled = true;
    button.innerHTML = `<div class="spinner"></div> Analyzing...`;
    
    const ticketData = extractTicketDescription();
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_text: ticketData.fullText,
        ticket_key: ticketData.ticketKey
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    displayEnhancedResults(result, ticketData.ticketKey);
    
  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = originalContent;
  }
}

function displayEnhancedResults(data, ticketKey) {
  const existingPopover = document.getElementById('jira-analyzer-popover');
  if (existingPopover) existingPopover.remove();
  
  const popover = document.createElement('div');
  popover.id = 'jira-analyzer-popover';
  popover.className = 'jira-analyzer-popover enhanced';
  
  const totalFiles = data.total_files || 0;
  const confidence = data.confidence_score || 0;
  const reasoning = data.reasoning || '';
  
  // Build category sections
  const categories = [
    { key: 'frontend_files', label: 'Frontend', icon: '🎨', color: '#3b82f6' },
    { key: 'backend_files', label: 'Backend', icon: '⚙️', color: '#8b5cf6' },
    { key: 'database_files', label: 'Database', icon: '🗄️', color: '#10b981' },
    { key: 'config_files', label: 'Config', icon: '⚙️', color: '#f59e0b' },
    { key: 'test_files', label: 'Tests', icon: '✓', color: '#ef4444' }
  ];
  
  let categoriesHtml = '';
  categories.forEach(cat => {
    const files = data[cat.key] || [];
    if (files.length > 0) {
      categoriesHtml += `
        <div class="file-category">
          <div class="category-header">
            <span class="category-icon">${cat.icon}</span>
            <span class="category-label">${cat.label}</span>
            <span class="category-count">${files.length}</span>
          </div>
          <ul class="file-list">
            ${files.map(file => `
              <li class="file-item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M9 1H3C2.4 1 2 1.4 2 2V14C2 14.6 2.4 15 3 15H13C13.6 15 14 14.6 14 14V6L9 1Z" stroke="${cat.color}" stroke-width="1.5"/>
                  <path d="M9 1V6H14" stroke="${cat.color}" stroke-width="1.5"/>
                </svg>
                <code>${escapeHtml(file)}</code>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  });
  
  popover.innerHTML = `
    <div class="popover-header">
      <div>
        <h3>File Analysis Results</h3>
        <div class="confidence-badge ${getConfidenceClass(confidence)}">
          ${(confidence * 100).toFixed(0)}% confidence
        </div>
      </div>
      <button class="close-btn" onclick="this.closest('.jira-analyzer-popover').remove()">×</button>
    </div>
    <div class="popover-content">
      ${totalFiles > 0 ? `
        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">Total Files:</span>
            <span class="summary-value">${totalFiles}</span>
          </div>
        </div>
        ${reasoning ? `
          <div class="reasoning-section">
            <strong>Analysis:</strong>
            <p>${escapeHtml(reasoning)}</p>
          </div>
        ` : ''}
        ${categoriesHtml}
      ` : `
        <p class="no-results">No specific files could be identified from this ticket description.</p>
      `}
    </div>
    <div class="popover-footer">
      <small>AI-powered analysis • ${ticketKey}</small>
    </div>
  `;
  
  document.body.appendChild(popover);
  setTimeout(() => popover.classList.add('show'), 10);
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

function showError(message) {
  const existingPopover = document.getElementById('jira-analyzer-popover');
  if (existingPopover) existingPopover.remove();
  
  const popover = document.createElement('div');
  popover.id = 'jira-analyzer-popover';
  popover.className = 'jira-analyzer-popover error';
  
  popover.innerHTML = `
    <div class="popover-header">
      <h3>Analysis Failed</h3>
      <button class="close-btn" onclick="this.closest('.jira-analyzer-popover').remove()">×</button>
    </div>
    <div class="popover-content">
      <p class="error-message">⚠️ ${escapeHtml(message)}</p>
      <p class="error-hint">Please check that the backend API is running and try again.</p>
    </div>
  `;
  
  document.body.appendChild(popover);
  setTimeout(() => popover.classList.add('show'), 10);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAnalyzeButton);
} else {
  injectAnalyzeButton();
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(injectAnalyzeButton, 1000);
  }
}).observe(document, { subtree: true, childList: true });
