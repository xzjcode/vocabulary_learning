document.addEventListener('DOMContentLoaded', () => {
  // Views
  const viewLogin = document.getElementById('view-login');
  const viewHome = document.getElementById('view-home');
  const viewQuizList = document.getElementById('view-quiz-list');
  const viewHistoryList = document.getElementById('view-history-list');
  const viewQuiz = document.getElementById('view-quiz');
  const appNav = document.getElementById('app-nav');
  
  const allViews = [viewLogin, viewHome, viewQuizList, viewHistoryList, viewQuiz];

  // DOM Elements
  const inputLoginName = document.getElementById('login-name');
  const btnLogin = document.getElementById('btn-login');
  const elHomeGreeting = document.getElementById('home-greeting');
  const btnGoNewTest = document.getElementById('btn-go-new-test');
  const btnGoHistory = document.getElementById('btn-go-history');
  
  // Notice we removed the inline logout button, because now we have global ones
  const btnGlobalHome = document.getElementById('btn-global-home');
  const btnGlobalLogout = document.getElementById('btn-global-logout');
  // For backwards compatibility from DOM if id still exists
  const btnLogoutLegacy = document.getElementById('btn-logout'); 
  
  const containerActiveQuizzes = document.getElementById('active-quizzes-container');
  const btnBackHomeFromQuizzes = document.getElementById('btn-back-home-from-quizzes');
  
  const containerHistory = document.getElementById('history-container');
  const btnBackHomeFromHistory = document.getElementById('btn-back-home-from-history');
  
  // Quiz DOM Elements
  const elQuizTitle = document.getElementById('quiz-title');
  const elProgressBar = document.getElementById('progress-bar');
  const elProgressText = document.getElementById('progress-text');
  const elLoading = document.getElementById('loading-spinner');
  const elQuestionCard = document.getElementById('question-card');
  const elQuestionText = document.getElementById('question-text');
  const elOptionsGrid = document.getElementById('options-grid');
  const elRationaleBox = document.getElementById('rationale-box');
  const elRationaleText = document.getElementById('rationale-text');
  const elHintBox = document.getElementById('hint-box');
  const elHintText = document.getElementById('hint-text');
  const elResultCard = document.getElementById('result-card');
  const elResultTitle = document.getElementById('result-title');
  const elFinalScore = document.getElementById('final-score');
  const elCorrectCount = document.getElementById('correct-count');
  const elTotalCount = document.getElementById('total-count');
  // btnSubmitScore removed from HTML
  const btnFinishReview = document.getElementById('btn-finish-review');
  const elFooter = document.querySelector('.app-footer');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  // Removed internal back button reference
  
  const elCheckinStatus = document.getElementById('checkin-status');
  const elCheckinText = elCheckinStatus?.querySelector('.status-text');

  // State
  let currentUser = localStorage.getItem('studentName');
  let quizData = null;
  let currentQuestionIndex = 0;
  let userAnswers = {}; // key: question index, value: { optionIndex, isCorrect, element }
  let isReviewMode = false;
  let currentQuizFilename = '';
  let currentQuizLayout = [];

  // Intercept fetch for 401 handling
  async function studentFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
      forceLogout();
      throw new Error('Unauthorized');
    }
    return res;
  }

  // Initialization
  init();

  function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const reviewId = urlParams.get('review');
    const isAdmin = urlParams.get('admin');

    if (reviewId) {
      handleURLReview(reviewId, isAdmin);
      return;
    }

    if (currentUser) {
      elHomeGreeting.textContent = `Hello, ${currentUser}!`;
      showView(viewHome);
      refreshCheckinStatus();
    } else {
      showView(viewLogin);
    }
  }

  async function handleURLReview(recordId, isAdmin) {
    try {
      showView(viewHistoryList);
      containerHistory.innerHTML = '<div class="loading-spinner"></div>';
      
      const endpoint = isAdmin ? '/api/scores' : `/api/scores/${encodeURIComponent(currentUser)}`;
      const res = await studentFetch(endpoint);
      if (!res.ok) throw new Error('Scores not found');
      
      const scores = await res.json();
      const record = scores.find(s => s.rid === recordId || s.recordId === recordId);
      if (record) {
        startReview(record);
      } else {
        alert('Record not found');
        currentUser ? showView(viewHome) : showView(viewLogin);
      }
    } catch(e) {
      alert('Error loading review');
      currentUser ? showView(viewHome) : showView(viewLogin);
    }
  }

  async function refreshCheckinStatus() {
    if (!elCheckinStatus) return;
    try {
      const res = await studentFetch(`/api/scores/${encodeURIComponent(currentUser)}`);
      const list = await res.json();
      const today = new Date().toDateString();
      const didCheckin = list.some(item => {
        const timestamp = item.ts || item.timestamp;
        if (!timestamp) return false;
        return new Date(timestamp).toDateString() === today;
      });
      elCheckinStatus.className = 'checkin-status mt-1 ' + (didCheckin ? 'checked-in' : 'not-checked-in');
      elCheckinText.textContent = didCheckin ? 'Mission accomplished🎉' : 'Mission incomplete🙈';
    } catch(e) {}
  }

  function showView(viewToShow) {
    allViews.forEach(v => {
      if(v) v.classList.add('hidden');
    });
    viewToShow.classList.remove('hidden');
    
    // Global Nav 
    if (viewToShow === viewLogin) {
      appNav.classList.add('hidden');
    } else {
      appNav.classList.remove('hidden');
    }

    // Fix flex display for quiz view
    if (viewToShow === viewQuiz) {
      viewQuiz.style.display = 'flex';
      btnGlobalHome.style.display = 'block';
      if (isReviewMode) {
        const urlParams = new URLSearchParams(window.location.search);
        btnGlobalHome.innerText = (urlParams.get('admin') === '1') ? 'Close' : 'Back';
      } else {
        btnGlobalHome.innerText = 'Quit Test'; 
      }
    } else {
      viewQuiz.style.display = 'none';
      btnGlobalHome.style.display = (viewToShow === viewHome) ? 'none' : 'block';
      btnGlobalHome.innerText = 'Home';
      if (viewToShow === viewLogin || viewToShow === viewHome) {
        // Clear any quiz data when going home
        quizData = null;
      }
    }
  }

  function forceLogout() {
    localStorage.removeItem('studentName');
    currentUser = null;
    showView(viewLogin);
  }

  async function performLogout() {
    try {
      await fetch('/api/student-logout', { method: 'POST' });
    } catch(e) {}
    forceLogout();
  }

  // Login events
  btnLogin.addEventListener('click', async () => {
    const name = inputLoginName.value.trim();
    if (name) {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Checking...';
      try {
        const res = await fetch('/api/student-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (res.ok) {
          localStorage.setItem('studentName', name);
          currentUser = name;
          elHomeGreeting.textContent = `Hello, ${currentUser}!`;
          showView(viewHome);
          refreshCheckinStatus();
        } else {
          alert('Name not in allowed students list. Ask your teacher.');
        }
      } catch (e) {
        alert('Server connection error.');
      }
      btnLogin.disabled = false;
      btnLogin.textContent = 'Enter';
    }
  });

  if (btnLogoutLegacy) btnLogoutLegacy.addEventListener('click', performLogout);
  btnGlobalLogout.addEventListener('click', performLogout);
  btnGlobalHome.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (!viewQuiz.classList.contains('hidden')) {
      if (!isReviewMode && elResultCard.classList.contains('hidden')) {
        if (!confirm('Are you sure you want to quit this test? All unsaved progress will be lost.')) {
          return;
        }
      }
    }
    
    if (isReviewMode && urlParams.get('admin') === '1') {
      window.close();
    } else {
      showView(viewHome);
    }
  });

  // Navigation
  btnGoNewTest.addEventListener('click', () => {
    showView(viewQuizList);
    loadActiveQuizzes();
  });

  btnGoHistory.addEventListener('click', () => {
    showView(viewHistoryList);
    loadHistoryData();
  });

  btnBackHomeFromQuizzes.addEventListener('click', () => showView(viewHome));
  btnBackHomeFromHistory.addEventListener('click', () => showView(viewHome));
  btnFinishReview.addEventListener('click', () => showView(viewHome));

  // --- Quiz List ---
  async function loadActiveQuizzes() {
    containerActiveQuizzes.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const res = await studentFetch('/api/active-quizzes-data');
      const list = await res.json();
      
      containerActiveQuizzes.innerHTML = '';
      if (list.length === 0) {
        containerActiveQuizzes.innerHTML = '<p style="text-align:center; color: var(--text-muted)">No active tests available.</p>';
      } else {
        list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'list-item';
          div.innerHTML = `<h3>${item.title}</h3><p>${item.filename}</p>`;
          div.addEventListener('click', () => startQuiz(item.filename));
          containerActiveQuizzes.appendChild(div);
        });
      }
    } catch (err) {
      containerActiveQuizzes.innerHTML = '<p style="text-align:center; color:red">Failed to load quizzes.</p>';
    }
  }

  // --- History List ---
  async function loadHistoryData() {
    containerHistory.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const res = await studentFetch(`/api/scores/${encodeURIComponent(currentUser)}`);
      if (!res.ok) {
        const errData = await res.json();
        containerHistory.innerHTML = `<p style="text-align:center; color:red">Error: ${errData.error || 'Failed to load scores'}</p>`;
        return;
      }
      
      const list = await res.json();
      
      containerHistory.innerHTML = '';
      if (list.length === 0) {
        containerHistory.innerHTML = '<p style="text-align:center; color: var(--text-muted)">You have not taken any tests yet.</p>';
      } else {
        list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item history-item';
        const d = new Date(item.ts || item.timestamp).toLocaleString();
        const scoreVal = item.s !== undefined ? item.s : item.score;
        const totalVal = item.tot !== undefined ? item.tot : item.totalQuestions;
        div.innerHTML = `
          <div class="score-badge ${parseInt(scoreVal) >= (totalVal * 0.8) ? 'score-high' : 'score-low'}">
             ${scoreVal}/${totalVal}
          </div>
          <div class="history-content">
             <h3>${item.qT || item.qF || item.quizId || item.quizFilename}</h3>
             <p>Accuracy: ${item.acc || item.accuracy} &bull; ${d}</p>
          </div>
        `;
        div.addEventListener('click', () => startReview(item));
        containerHistory.appendChild(div);
        });
      }
    } catch(err) {
      containerHistory.innerHTML = '<p style="text-align:center; color:red">Failed to connect to server.</p>';
    }
  }

  // --- Quiz Core ---
  async function startQuiz(filename) {
    isReviewMode = false;
    currentQuizFilename = filename;
    userAnswers = {};
    currentQuestionIndex = 0;
    
    showView(viewQuiz);
    elLoading.classList.remove('hidden');
    elQuestionCard.classList.add('hidden');
    elResultCard.classList.add('hidden');
    elFooter.classList.add('hidden');
    
    btnFinishReview.style.display = 'none';
    elResultTitle.innerText = "Quiz Complete!";
    
    try {
      elLoading.classList.remove('hidden');
      elQuestionCard.classList.add('hidden');
      elFooter.classList.add('hidden');
      elResultCard.classList.add('hidden');
      
      const res = await studentFetch(`/api/quiz-data/${encodeURIComponent(filename)}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Server returned error');
      }
      const json = await res.json();
      console.log('Quiz data received for:', filename, 'Questions:', json.data?.questions?.length);
      quizData = json.data;
      currentQuizLayout = [];
      
      if (quizData && quizData.questions) {
        if (json.maxQuestions && quizData.questions.length > json.maxQuestions) {
          const shuffled = [...quizData.questions].sort(() => 0.5 - Math.random());
          quizData.questions = shuffled.slice(0, json.maxQuestions);
        }
        
        quizData.questions.forEach(q => {
          if (q.options) {
            const originals = [...q.options];
            q.options.sort(() => Math.random() - 0.5);
            const optionsOrder = q.options.map(opt => originals.indexOf(opt));
            currentQuizLayout.push({ id: q.id, optionsOrder });
          } else {
            currentQuizLayout.push({ id: q.id, optionsOrder: [] });
          }
        });
      }
      
      elQuizTitle.innerText = quizData.quiz_title || 'Vocabulary Quiz';
      
      if (quizData.questions && quizData.questions.length > 0) {
        renderQuestion(0);
      } else {
        elQuestionCard.innerHTML = '<p style="text-align:center;">This quiz has no questions.</p>';
        elQuestionCard.classList.remove('hidden');
      }
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        elQuizTitle.innerText = 'Load Failed';
        elQuestionCard.innerHTML = `<p style="text-align:center; color:red">Error: ${err.message}</p>`;
        elQuestionCard.classList.remove('hidden');
      }
    } finally {
      elLoading.classList.add('hidden');
    }
  }

  async function startReview(recordItem) {
    isReviewMode = true;
    userAnswers = recordItem.answers || {};
    currentQuestionIndex = 0;
    
    showView(viewQuiz);
    elLoading.classList.remove('hidden');
    elQuestionCard.classList.add('hidden');
    elResultCard.classList.add('hidden');
    elFooter.classList.add('hidden');
    
    btnFinishReview.style.display = 'block';
    btnFinishReview.classList.remove('hidden');
    elResultTitle.innerText = "Review Result";    try {
      const qFile = recordItem.qF || recordItem.quizFilename;
      if (!qFile) {
        throw new Error('This record is missing quiz source file information.');
      }
      
      const res = await studentFetch(`/api/quiz-data/${encodeURIComponent(qFile)}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Quiz file not found');
      }
      const json = await res.json();
      console.log('Review quiz data fetched for:', qFile, 'Questions:', json.data?.questions?.length);
      
      quizData = json.data;
      if (recordItem.seed || recordItem.quizLayout) {
        let seedArray = recordItem.seed;
        // Backwards compat with just-created quizLayout logic
        if (!seedArray && recordItem.quizLayout) {
          seedArray = recordItem.quizLayout.map(lay => [lay.id, lay.optionsOrder]);
        }
        let reconstructedQuestions = [];
        seedArray.forEach(seedItem => {
          let q = quizData.questions.find(item => String(item.id) === String(seedItem[0]));
          if (q) {
             let originalOptions = [...q.options];
             q.options = seedItem[1].map(idx => originalOptions[idx]);
             reconstructedQuestions.push(q);
          }
        });
        quizData.questions = reconstructedQuestions;
        console.log('Reconstructed quiz from layout seed.');
      }
      
      elQuizTitle.innerText = quizData.quiz_title || 'Vocabulary Quiz';
      
      userAnswers = {};
      const recordAns = recordItem.ans || recordItem.answers;
      if (recordAns) {
        for(let k in recordAns) {
           let val = recordAns[k];
           if (Array.isArray(val)) {
             userAnswers[k] = { optionIndex: val[0], isCorrect: val[1] === 1 };
           } else {
             userAnswers[k] = val;
           }
        }
      }      if (quizData.questions && quizData.questions.length > 0) {
        renderQuestion(0);
      } else {
        throw new Error('No questions found in this quiz.');
      }
    } catch (err) {
      elQuizTitle.innerText = 'Review Error';
      elQuestionCard.innerHTML = `<p style="text-align:center; padding:2rem; color:red">${err.message}</p>`;
      elQuestionCard.classList.remove('hidden');
    } finally {
      elLoading.classList.add('hidden');
    }
  }

  function renderQuestion(index) {
    const question = quizData.questions[index];
    currentQuestionIndex = index;

    elProgressText.innerText = `${index + 1} / ${quizData.questions.length}`;
    elProgressBar.style.width = `${((index + 1) / quizData.questions.length) * 100}%`;

    elQuestionText.innerText = question.text;
    elOptionsGrid.innerHTML = '';
    
    // Reset boxes
    elRationaleBox.classList.add('hidden');
    elRationaleBox.classList.remove('correct-rationale', 'incorrect-rationale');
    elHintBox.classList.add('hidden');
    
    const hasAnswered = userAnswers[index] !== undefined;

    question.options.forEach((opt, optIndex) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerText = opt.text;
      
      if (hasAnswered) {
        btn.disabled = true;
        const ans = userAnswers[index];
        if (ans.optionIndex === optIndex) {
          btn.classList.add(ans.isCorrect ? 'correct' : 'incorrect');
        } else if (opt.is_correct) {
          btn.classList.add('correct');
        }
      } else if (!isReviewMode) {
        btn.onclick = () => handleOptionSelect(opt, optIndex, btn);
      } else {
        btn.disabled = true; // Review mode, but option wasn't selected
        if (opt.is_correct) btn.classList.add('correct');
      }
      
      elOptionsGrid.appendChild(btn);
    });

    if (hasAnswered) {
      const ans = userAnswers[index];
      const selectedOpt = question.options[ans.optionIndex];
      const correctOpt = question.options.find(o => o.is_correct);
      
      let htmlContent = '';
      if (ans.isCorrect) {
        htmlContent = `<div style="color: #065f46;"><strong>✅ ${selectedOpt.text}:</strong> ${selectedOpt.rationale || 'Correct!'}</div>`;
      } else {
        htmlContent = `
          <div style="margin-bottom:0.75rem; color: #991b1b;"><strong>❌ ${selectedOpt ? selectedOpt.text : 'Unknown'}:</strong> ${selectedOpt ? (selectedOpt.rationale || 'Your selection') : ''}</div>
          <div style="color: #065f46;"><strong>✅ ${correctOpt ? correctOpt.text : 'Correct Answer'}:</strong> ${correctOpt ? (correctOpt.rationale || '') : ''}</div>
        `;
      }
      
      showRationale(htmlContent, ans.isCorrect);
    } else if (question.hint && !isReviewMode) {
      elHintText.innerText = `Hint: ${question.hint}`;
      elHintBox.classList.remove('hidden');
    }

    elResultCard.classList.add('hidden');
    elQuestionCard.classList.remove('hidden');
    elFooter.classList.remove('hidden');

    btnPrev.disabled = index === 0;
    
    if (index === quizData.questions.length - 1) {
      btnNext.innerText = isReviewMode ? 'Finish Review' : 'Finish Quiz';
      btnNext.disabled = !isReviewMode && !hasAnswered;
    } else {
      btnNext.innerText = 'Next';
      btnNext.disabled = !isReviewMode && !hasAnswered;
    }
  }

  function handleOptionSelect(option, optIndex, btnElement) {
    if (isReviewMode) return;
    const isCorrect = option.is_correct === true;
    userAnswers[currentQuestionIndex] = {
      optionIndex: optIndex,
      isCorrect: isCorrect
    };
    renderQuestion(currentQuestionIndex);
  }

  function showRationale(htmlStr, isCorrect) {
    if (!htmlStr) return;
    elRationaleBox.classList.remove('hidden', 'correct-rationale', 'incorrect-rationale');
    elRationaleBox.classList.add(isCorrect ? 'correct-rationale' : 'incorrect-rationale');
    elRationaleText.innerHTML = htmlStr;
  }

  btnNext.addEventListener('click', () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      elQuestionCard.style.animation = 'none';
      setTimeout(() => {
        elQuestionCard.style.animation = 'fadeIn 0.4s ease';
        renderQuestion(currentQuestionIndex + 1);
      }, 10);
    } else {
      if (!isReviewMode) {
        autoSubmitQuiz();
      } else {
        showResult();
      }
    }
  });

  btnPrev.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
      renderQuestion(currentQuestionIndex - 1);
    }
  });

  function showResult() {
    elQuestionCard.classList.add('hidden');
    elFooter.classList.add('hidden');
    elResultCard.classList.remove('hidden');

    elProgressBar.style.width = '100%';
    elProgressText.innerText = `${quizData.questions.length} / ${quizData.questions.length}`;

    let correctNum = 0;
    for (let i = 0; i < quizData.questions.length; i++) {
      if (userAnswers[i] && userAnswers[i].isCorrect) {
        correctNum++;
      }
    }
    
    const accuracy = ((correctNum / quizData.questions.length) * 100).toFixed(0);
    elFinalScore.innerText = `${accuracy}%`;
    elFinalScore.style.color = accuracy >= 80 ? 'var(--correct)' : (accuracy >= 60 ? 'var(--primary)' : 'var(--incorrect)');
    elCorrectCount.innerText = correctNum;
    elTotalCount.innerText = quizData.questions.length;
    
    // Generate Mini Review for Result Page
    const elReviewList = document.getElementById('result-review-list');
    if (elReviewList) {
      elReviewList.innerHTML = '';
      quizData.questions.forEach((q, idx) => {
        const ans = userAnswers[idx];
        if (ans && !ans.isCorrect) {
          const item = document.createElement('div');
          item.className = 'missed-item';
          const correctOpt = q.options.find(o => o.is_correct);
          item.innerHTML = `
            <p class="missed-q"><strong>Q${idx+1}:</strong> ${q.text}</p>
            <p class="missed-a">Correct: ${correctOpt ? correctOpt.text : 'N/A'}</p>
            <div class="missed-r">${correctOpt?.rationale || 'No rationale available.'}</div>
          `;
          elReviewList.appendChild(item);
        }
      });
    }

    elResultCard.classList.remove('hidden');
    
    // Globally show home button at result screen
    btnGlobalHome.style.display = 'block';
    
    // Show back to home button
    btnFinishReview.innerText = 'Back to Home';
    btnFinishReview.style.display = 'block';
    btnFinishReview.classList.remove('hidden');
  }

  async function autoSubmitQuiz() {
    let correctNum = 0;
    for (let i = 0; i < quizData.questions.length; i++) {
        if (userAnswers[i] && userAnswers[i].isCorrect) {
          correctNum++;
        }
    }
    const accuracy = ((correctNum / quizData.questions.length) * 100).toFixed(0);
    
    let compactAns = {};
    for(let k in userAnswers) {
      compactAns[k] = [userAnswers[k].optionIndex, userAnswers[k].isCorrect ? 1 : 0];
    }
    let compactSeed = currentQuizLayout.map(q => [q.id, q.optionsOrder]);
    
    const payload = {
      qT: quizData.quiz_title,
      qF: currentQuizFilename,
      s: correctNum,
      acc: accuracy + '%',
      tot: quizData.questions.length,
      ts: Date.now(),
      ans: compactAns,
      seed: compactSeed
    };

    // Show result view immediately so it doesn't feel laggy
    showResult();

    try {
      const res = await studentFetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        console.log('Score submitted successfully');
      }
    } catch(err) {
      console.error('Auto-submit failed', err);
    }
  }
});
