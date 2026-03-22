document.addEventListener('DOMContentLoaded', () => {
  const elUploadFormBtn = document.getElementById('btn-upload');
  const uploadFormElement = document.getElementById('upload-form');
  const fileInput = document.getElementById('quiz-file');
  const uploadStatus = document.getElementById('upload-status');
  
  const quizzesListContainer = document.getElementById('quizzes-list');
  const btnSaveActive = document.getElementById('btn-save-active');
  const settingsStatus = document.getElementById('settings-status');

  const btnRefreshScores = document.getElementById('btn-refresh-scores');
  const scoresTbody = document.getElementById('scores-tbody');

  const studentsListContainer = document.getElementById('students-list');
  const addStudentForm = document.getElementById('add-student-form');
  const newStudentInput = document.getElementById('new-student-name');
  
  const changePwdForm = document.getElementById('change-pwd-form');
  const newPwdInput = document.getElementById('new-admin-pwd');
  const pwdStatus = document.getElementById('pwd-status');

  const btnAdminLogout = document.getElementById('btn-admin-logout');

  let currentQuizConfigs = {};

  // Custom fetch to intercept 401
  async function adminFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
      window.location.href = '/admin-login.html';
      throw new Error('Unauthorized');
    }
    return res;
  }

  // Load Initial Data
  loadQuizzes();
  loadScores();
  loadStudents();

  async function loadQuizzes() {
    try {
      const res = await adminFetch('/api/quizzes');
      const files = await res.json();
      
      const activeRes = await adminFetch('/api/active-quizzes');
      const activeData = await activeRes.json();
      const activeArr = activeData.activeQuizzes || [];
      currentQuizConfigs = activeData.quizConfigs || {};
      
      quizzesListContainer.innerHTML = '';
      if (files.length === 0) {
        quizzesListContainer.innerHTML = '<p class="text-muted">No quizzes uploaded yet.</p>';
      } else {
        files.forEach(f => {
          const row = document.createElement('div');
          row.className = 'quiz-item-row';
          const isActive = activeArr.includes(f);
          const checkboxId = `chk-${f}`;
          const maxQ = currentQuizConfigs[f]?.maxQuestions || '';
          
          row.innerHTML = `
            <div class="quiz-item-left" style="flex:1;">
              <input type="checkbox" id="${checkboxId}" value="${f}" class="quiz-checkbox" ${isActive ? 'checked' : ''}>
              <label for="${checkboxId}">${f}</label>
            </div>
            <div style="margin-right:1rem; display:flex; align-items:center; gap:0.5rem;">
              <label style="font-size:0.8rem; color:var(--text-muted);">Max Q:</label>
              <input type="number" class="max-q-input form-select" style="width:60px; padding:0.25rem;" value="${maxQ}" data-filename="${f}">
            </div>
            <button class="btn btn-secondary btn-sm btn-delete" style="color:red;" data-filename="${f}">Delete</button>
          `;
          row.querySelector('.btn-delete').addEventListener('click', () => deleteQuiz(f));
          quizzesListContainer.appendChild(row);
        });
      }
    } catch (err) { }
  }

  async function deleteQuiz(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    try {
      const res = await adminFetch('/api/quizzes/' + encodeURIComponent(filename), { method: 'DELETE' });
      if (res.ok) {
        settingsStatus.textContent = 'Deleted ' + filename;
        settingsStatus.style.color = 'green';
        setTimeout(() => settingsStatus.textContent = '', 2000);
        loadQuizzes();
      }
    } catch (err) { }
  }

  async function loadScores() {
    try {
      scoresTbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
      const res = await adminFetch('/api/scores');
      const scores = await res.json();
      scoresTbody.innerHTML = '';
      if (scores.length === 0) {
        scoresTbody.innerHTML = '<tr><td colspan="5" class="text-center">No scores recorded yet.</td></tr>';
      } else {
        scores.forEach(s => {
          const tr = document.createElement('tr');
          const rowData = encodeURIComponent(JSON.stringify(s));
          const timestamp = s.ts || s.timestamp;
          const uName = s.u || s.name;
          const qId = s.qT || s.quizId || s.qF || s.quizFilename;
          const score = s.s !== undefined ? s.s : s.score;
          const tot = s.tot !== undefined ? s.tot : s.totalQuestions;
          const acc = s.acc || s.accuracy;
          tr.innerHTML = `
            <td style="font-size:0.8rem;">${new Date(timestamp).toLocaleString()}</td>
            <td><strong>${uName}</strong></td>
            <td>${qId}</td>
            <td>${score}/${tot}</td>
            <td>${acc}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="viewHistoryDetail('${rowData}')">Review</button></td>
          `;
          scoresTbody.appendChild(tr);
        });
      }
    } catch (err) { }
  }

  window.viewHistoryDetail = (jsonStr) => {
    const data = JSON.parse(decodeURIComponent(jsonStr));
    const rid = data.rid || data.recordId;
    window.open(`/?review=${rid}&admin=1`, '_blank');
  };

  async function loadStudents() {
    try {
      const res = await adminFetch('/api/allowed-students');
      const students = await res.json();
      studentsListContainer.innerHTML = '';
      if (students.length === 0) {
        studentsListContainer.innerHTML = '<p class="text-muted">No allowed students.</p>';
      } else {
        students.forEach(s => {
          const row = document.createElement('div');
          row.className = 'quiz-item-row';
          row.innerHTML = `
            <div class="quiz-item-left"><strong>${s}</strong></div>
            <button class="btn btn-secondary btn-sm" style="color:red;">Remove</button>
          `;
          row.querySelector('button').addEventListener('click', async () => {
            if(!confirm(`Remove student ${s}?`)) return;
            const delRes = await adminFetch('/api/allowed-students/' + encodeURIComponent(s), { method: 'DELETE' });
            if (delRes.ok) loadStudents();
          });
          studentsListContainer.appendChild(row);
        });
      }
    } catch (err) { }
  }

  addStudentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newStudentInput.value.trim();
    if (!name) return;
    try {
      const res = await adminFetch('/api/allowed-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        newStudentInput.value = '';
        loadStudents();
      }
    } catch (err) {}
  });

  changePwdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = newPwdInput.value;
    if (!newPassword) return;
    try {
      const res = await adminFetch('/api/admin-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        pwdStatus.textContent = 'Password changed!';
        pwdStatus.style.color = 'green';
        newPwdInput.value = '';
        setTimeout(() => pwdStatus.textContent = '', 2000);
      }
    } catch(err) {}
  });

  uploadFormElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fileInput.files.length === 0) return;
    elUploadFormBtn.disabled = true;
    elUploadFormBtn.textContent = 'Uploading...';
    uploadStatus.textContent = '';
    
    const formData = new FormData();
    formData.append('quizFile', fileInput.files[0]);

    try {
      const res = await adminFetch('/api/quizzes', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      uploadStatus.textContent = 'Upload successful!';
      uploadStatus.style.color = 'green';
      fileInput.value = '';
      loadQuizzes();
    } catch(err) {
      uploadStatus.textContent = 'Error: ' + err.message;
      uploadStatus.style.color = 'red';
    } finally {
      elUploadFormBtn.disabled = false;
      elUploadFormBtn.textContent = 'Upload YAML';
    }
  });

  btnSaveActive.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.quiz-checkbox:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    
    // Collect max questions
    const qConfigs = {};
    document.querySelectorAll('.max-q-input').forEach(input => {
      const val = parseInt(input.value);
      if (!isNaN(val) && val > 0) {
        qConfigs[input.dataset.filename] = { maxQuestions: val };
      }
    });

    try {
      const res = await adminFetch('/api/active-quizzes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeQuizzes: selected, quizConfigs: qConfigs })
      });
      if (res.ok) {
        settingsStatus.textContent = 'Settings saved!';
        settingsStatus.style.color = 'green';
        setTimeout(() => settingsStatus.textContent = '', 2000);
      }
    } catch (err) { }
  });

  btnRefreshScores.addEventListener('click', loadScores);
  
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/admin-logout', { method: 'POST' });
      } catch(e) {}
      localStorage.removeItem('adminRole');
      window.location.reload();
    });
  }
});
