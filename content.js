// API Configuration
const API_URL = 'http://localhost:5000/analyze';

// Create and inject the analyze button
function injectAnalyzeButton() {
  // Check if button already exists
  if (document.getElementById('jira-analyzer-btn')) return;

  // Find the ticket header area
  const headerArea = document.querySelector('[data-test-id="issue.views.issue-base.foundation.summary.heading"]') ||
                     document.querySelector('h1[data-test-id]') ||
                     document.querySelector('#summary-val');
  
  if (!headerArea) {
    console.log('Header area not found, retrying...');
    setTimeout(injectAnalyzeButton, 1000);
    return;
  }

  // Create the analyze button
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
  
  // Insert button near the header
  const container = headerArea.parentElement;
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '12px';
  container.appendChild(button);
}

// Extract ticket description from the page
function extractTicketDescription() {
  // Try multiple selectors for description
  const descriptionElement = 
    document.querySelector('[data-test-id="issue.views.field.rich-text.description"]') ||
    document.querySelector('.user-content-block') ||
    document.querySelector('#description-val') ||
    document.querySelector('.description');
  
  if (!descriptionElement) {
    throw new Error('Could not find ticket description');
  }

  // Get the ticket title/summary
  const titleElement = document.querySelector('[data-test-id="issue.views.issue-base.foundation.summary.heading"]') ||
                       document.querySelector('#summary-val');
  const title = titleElement ? titleElement.textContent.trim() : '';
  
  // Get the ticket key (e.g., PROJ-123)
  const ticketKey = window.location.pathname.split('/').pop();
  
  const description = descriptionElement.textContent.trim();
  
  return {
    ticketKey,
    title,
    description,
    fullText: `${title}\n\n${description}`
  };
}

// Handle analyze button click
async function handleAnalyzeClick(e) {
  e.preventDefault();
  
  const button = e.currentTarget;
  const originalContent = button.innerHTML;
  
  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = `
      <div class="spinner"></div>
      Analyzing...
    `;
    
    // Extract ticket data
    const ticketData = extractTicketDescription();
    
    // Send to backend
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticket_text: ticketData.fullText,
        ticket_key: ticketData.ticketKey
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Display results
    displayResults(result, ticketData.ticketKey);
    
  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message);
  } finally {
    // Restore button
    button.disabled = false;
    button.innerHTML = originalContent;
  }
}

// Display results in a popover
function displayResults(data, ticketKey) {
  // Remove existing popover
  const existingPopover = document.getElementById('jira-analyzer-popover');
  if (existingPopover) {
    existingPopover.remove();
  }
  
  // Create popover
  const popover = document.createElement('div');
  popover.id = 'jira-analyzer-popover';
  popover.className = 'jira-analyzer-popover';
  
  const files = data.files || [];
  
  popover.innerHTML = `
    <div class="popover-header">
      <h3>Predicted File Changes</h3>
      <button class="close-btn" onclick="this.closest('.jira-analyzer-popover').remove()">×</button>
    </div>
    <div class="popover-content">
      ${files.length > 0 ? `
        <p class="file-count">${files.length} file${files.length !== 1 ? 's' : ''} identified:</p>
        <ul class="file-list">
          ${files.map(file => `
            <li class="file-item">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M9 1H3C2.4 1 2 1.4 2 2V14C2 14.6 2.4 15 3 15H13C13.6 15 14 14.6 14 14V6L9 1Z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M9 1V6H14" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <code>${escapeHtml(file)}</code>
            </li>
          `).join('')}
        </ul>
      ` : `
        <p class="no-results">No specific files could be identified from this ticket description.</p>
      `}
    </div>
    <div class="popover-footer">
      <small>Powered by AI analysis</small>
    </div>
  `;
  
  document.body.appendChild(popover);
  
  // Animate in
  setTimeout(() => popover.classList.add('show'), 10);
}

// Show error message
function showError(message) {
  const existingPopover = document.getElementById('jira-analyzer-popover');
  if (existingPopover) {
    existingPopover.remove();
  }
  
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

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAnalyzeButton);
} else {
  injectAnalyzeButton();
}

// Re-inject button when navigating between tickets (for SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(injectAnalyzeButton, 1000);
  }
}).observe(document, { subtree: true, childList: true });
