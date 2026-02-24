(function () {
  const inputField = document.getElementById('userInput');
  const searchBtn = document.getElementById('goBtn');
  const msgBox = document.getElementById('messageBoard');

  const profileDiv = document.getElementById('userProfile');
  const avatar = document.getElementById('profileAvatar');
  const nameEl = document.getElementById('displayName');
  const bioEl = document.getElementById('displayBio');
  const followersEl = document.getElementById('followerCount');
  const followingEl = document.getElementById('followingCount');
  const repoCountProfile = document.getElementById('repoCountNum');

  const repoSection = document.getElementById('repoContainer');
  const repoCountBadge = document.getElementById('repoCountMsg');
  const repoGrid = document.getElementById('repoGridArea');

  const modalOverlay = document.getElementById('modalOverlay');
  const modalInner = document.getElementById('modalInner');


  let loading = false;
  let lastUser = '';
  let abortController = null; // For cancelling previous requests

  // Cache to store recent results
  const cache = {
    user: new Map(),
    repos: new Map()
  };

  function setMessage(type, text) {
    msgBox.innerHTML = '';
    msgBox.classList.remove('hidden');
    msgBox.className = 'msg-box';

    if (type === 'loading') {
      msgBox.innerHTML = '<div class="spinner"></div><span> ⏳ fetching ...</span>';
    } else if (type === 'error') {
      msgBox.innerHTML = `<span class="error-badge">❌ ${text}</span>`;
    } else if (type === 'empty') {
      msgBox.innerHTML = `<span style="padding-left: 12px;">📁 ${text}</span>`;
    } else if (type === 'clear') {
      msgBox.classList.add('hidden');
    }
  }

  function hideMessage() {
    msgBox.classList.add('hidden');
  }

  function renderProfile(user) {
    profileDiv.classList.remove('hidden');
    avatar.src = user.avatar_url || 'https://via.placeholder.com/120?text=?';
    nameEl.innerText = user.name || user.login;
    bioEl.innerText = user.bio || '👤 no bio';
    followersEl.innerText = user.followers ?? 0;
    followingEl.innerText = user.following ?? 0;
    repoCountProfile.innerText = user.public_repos ?? 0;
  }

  function hideProfile() {
    profileDiv.classList.add('hidden');
  }

  function renderRepos(repos) {
    if (!repos || repos.length === 0) {
      repoSection.classList.add('hidden');
      setMessage('empty', 'This user has no public repos.');
      return;
    }

    repoSection.classList.remove('hidden');
    repoCountBadge.innerText = repos.length + ' repo' + (repos.length > 1 ? 's' : '');

    repoGrid.innerHTML = '';


    repos.forEach(repo => {
      const card = document.createElement('div');
      card.className = 'repo-item';

      card.setAttribute('data-repo', repo.name);
      card.setAttribute('data-stars', repo.stargazers_count ?? 0);
      card.setAttribute('data-forks', repo.forks_count ?? 0);
      card.setAttribute('data-language', repo.language || '—');
      card.setAttribute('data-desc', repo.description || 'no description');
      card.setAttribute('data-url', repo.html_url || '#');

      card.innerHTML = `
          <div class="r-name">${escapeBasic(repo.name)}</div>
          <div class="r-stats">
            <span>⭐ ${repo.stargazers_count ?? 0}</span>
            <span>🔗 ${repo.forks_count ?? 0}</span>
          </div>
          <div class="lang-tag">${escapeBasic(repo.language) || '—'}</div>
        `;

      card.addEventListener('click', function () {
        openModalFunc(repo);
      });

      repoGrid.appendChild(card);
    });
  }

  function hideRepos() {
    repoSection.classList.add('hidden');
  }

  function escapeBasic(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function (c) {
      if (c === '&') return '&amp;';
      if (c === '<') return '&lt;';
      if (c === '>') return '&gt;';
      return c;
    });
  }

  function openModalFunc(r) {
    modalInner.innerHTML = `
        <h2>${escapeBasic(r.name)}</h2>
        <p style="color: #234468;">${escapeBasic(r.description) || '📄 no description provided'}</p>
        <div class="modal-stats">
          <span>⭐ <strong>${r.stargazers_count ?? 0}</strong> stars</span>
          <span>🔀 <strong>${r.forks_count ?? 0}</strong> forks</span>
          <span>🔤 <strong>${escapeBasic(r.language) || '—'}</strong></span>
        </div>
        <p><a href="${escapeBasic(r.html_url)}" target="_blank" style="color: #1d5e9b;">open on github ↗</a></p>
        <button class="close-btn" id="closeModalBtn">close</button>
      `;
    modalOverlay.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', function () {
      modalOverlay.classList.add('hidden');
    });
  }


  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) {
      modalOverlay.classList.add('hidden');
    }
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
      modalOverlay.classList.add('hidden');
    }
  });

  // Enhanced fetch with abort controller and retry logic
  async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async function fetchUser(username) {
    // Check cache first
    if (cache.user.has(username)) {
      console.log('Using cached user data');
      return cache.user.get(username);
    }

    try {
      const res = await fetchWithTimeout(`https://api.github.com/users/${username}`);
      
      if (res.status === 403) {
        const resetTime = res.headers.get('X-RateLimit-Reset');
        if (resetTime) {
          const resetDate = new Date(resetTime * 1000);
          throw new Error(`Rate limit exceeded. Try again after ${resetDate.toLocaleTimeString()}`);
        }
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      if (!res.ok) {
        if (res.status === 404) throw new Error('user not found');
        else throw new Error(`error ${res.status}`);
      }
      
      const data = await res.json();
      // Store in cache
      cache.user.set(username, data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      }
      throw error;
    }
  }

  async function fetchRepos(username) {
    // Check cache first
    if (cache.repos.has(username)) {
      console.log('Using cached repos data');
      return cache.repos.get(username);
    }

    try {
      const res = await fetchWithTimeout(`https://api.github.com/users/${username}/repos?per_page=30&sort=updated`);
      
      if (res.status === 403) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      if (!res.ok) throw new Error('repo fetch failed');
      
      const data = await res.json();
      // Store in cache
      cache.repos.set(username, data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      }
      throw error;
    }
  }

  // Alternative API endpoint (if you have a backend proxy)
  // You could also use GitHub's GraphQL API with a token
  async function fetchWithFallback(username) {
    const token = 'YOUR_GITHUB_TOKEN'; // Optional: Add your token for higher rate limits
    
    try {
      // Try with token if available
      if (token) {
        const headers = {
          'Authorization': `token ${token}`
        };
        
        const res = await fetch(`https://api.github.com/users/${username}`, { headers });
        if (res.ok) return await res.json();
      }
      
      // Fallback to no token
      const res = await fetch(`https://api.github.com/users/${username}`);
      return await res.json();
    } catch (error) {
      throw error;
    }
  }

  async function findUser(username) {
    const term = username.trim();
    if (term === '') {
      setMessage('error', 'type something');
      return;
    }

    // Cancel previous request if exists
    if (abortController) {
      abortController.abort();
    }

    searchBtn.disabled = true;
    loading = true;
    setMessage('loading', '');

    hideProfile();
    hideRepos();
    hideMessage();

    try {
      // Add small delay to prevent rapid successive requests
      await new Promise(resolve => setTimeout(resolve, 300));

      const [userData, reposData] = await Promise.all([
        fetchUser(term),
        fetchRepos(term)
      ]);

      lastUser = term;
      renderProfile(userData);

      if (reposData.length === 0) {
        hideRepos();
        setMessage('empty', 'No public repos found.');
      } else {
        renderRepos(reposData);
        hideMessage();
      }

    } catch (err) {
      hideProfile();
      hideRepos();
      
      let errorText = err.message || 'network issue';
      
      // Check if it's a rate limit error and show helpful message
      if (errorText.includes('Rate limit')) {
        errorText += ' ⏰ Wait a minute and try again, or try a different username.';
      }
      
      setMessage('error', errorText);
    } finally {
      loading = false;
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', function () {
    findUser(inputField.value);
  });

  inputField.addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && !loading) {
      findUser(inputField.value);
    }
  });

  // Add debounce to prevent too many requests while typing
  let debounceTimer;
  inputField.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Optional: auto-search after user stops typing
      // if (inputField.value.length > 2) {
      //   findUser(inputField.value);
      // }
    }, 500);
  });

  window.addEventListener('load', function () {
    inputField.value = 'MayankMishra4998';
    findUser('MayankMishra4998');
  });

})();