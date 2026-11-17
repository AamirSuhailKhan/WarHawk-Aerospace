(() => {
  'use strict';

  const ALLOWED_CATEGORIES = new Set([
    'Scheduled Drone Patrols',
    'AI Surveillance & Live Monitoring',
    'Industrial & Infrastructure Inspection',
    'Dedicated Industrial Monitoring',
    'Emergency & Incident Response',
    'Turnkey DaaS Contracts',
    'Technology & Software Partnership',
    'General Inquiry',
    'Drone Products',
    'Drone Services',
    'Technology Partnership',
    'Business Collaboration',
    'Technical Support',
    'Other'
  ]);

  function generateKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `wh-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function validateField(name, form) {
    const field = form.elements.namedItem(name);
    if (!field) return '';

    if (name === 'fullName') {
      const v = field.value.trim();
      if (v.length < 2 || v.length > 120) {
        return 'Please enter your full name (2 to 120 characters).';
      }
      return '';
    }

    if (name === 'workEmail') {
      const v = field.value.trim();
      if (!v || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        return 'Please enter a valid work email address.';
      }
      return '';
    }

    if (name === 'phone') {
      const v = field.value.trim();
      if (v && !/^[+()\d\s.-]{6,32}$/.test(v)) {
        return 'Enter 6 to 32 valid digits or phone separators, or leave blank.';
      }
      return '';
    }

    if (name === 'company') {
      if (field.value.trim().length > 160) {
        return 'Company or organization must be 160 characters or fewer.';
      }
      return '';
    }

    if (name === 'category') {
      if (!ALLOWED_CATEGORIES.has(field.value.trim())) {
        return 'Please choose an inquiry category.';
      }
      return '';
    }

    if (name === 'message') {
      const v = field.value.trim();
      if (v.length < 10 || v.length > 3000) {
        return 'Please provide at least 10 characters (max 3,000).';
      }
      return '';
    }

    if (name === 'consent') {
      if (!field.checked) {
        return 'Please confirm consent to submit your inquiry.';
      }
      return '';
    }

    return '';
  }

  function setFieldError(form, name, msg) {
    const field = form.elements.namedItem(name);
    const errEl = form.querySelector(`[data-error-for="${name}"]`);
    if (field) {
      field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    if (errEl) {
      errEl.textContent = msg || '';
    }
  }

  function initForm(form) {
    const root = form.closest('[data-contact-widget]') || form.parentElement;
    const statusBox = root.querySelector('[data-form-status]');
    const submitBtn = form.querySelector('[type="submit"]');
    const submitLabel = submitBtn ? submitBtn.querySelector('[data-submit-label]') : null;
    const charCountEl = form.querySelector('[data-char-count]');
    const messageEl = form.elements.namedItem('message');
    const categoryEl = form.elements.namedItem('category');

    let idempotencyKey = generateKey();
    let isSubmitting = false;
    const touched = new Set();

    // Apply preselected category from query string if valid
    const urlParams = new URLSearchParams(window.location.search);
    const initialCat = urlParams.get('category');
    if (initialCat && ALLOWED_CATEGORIES.has(initialCat) && categoryEl) {
      categoryEl.value = initialCat;
    }

    window.addEventListener('warhawk:select-category', (event) => {
      const cat = event.detail && event.detail.category;
      if (cat && ALLOWED_CATEGORIES.has(cat) && categoryEl) {
        categoryEl.value = cat;
        touched.add('category');
        setFieldError(form, 'category', '');
      }
    });

    if (messageEl && charCountEl) {
      const updateCount = () => {
        charCountEl.textContent = `${messageEl.value.length} / 3,000`;
      };
      messageEl.addEventListener('input', updateCount);
      updateCount();
    }

    const fieldNames = ['fullName', 'workEmail', 'phone', 'company', 'category', 'message', 'consent'];

    fieldNames.forEach((name) => {
      const field = form.elements.namedItem(name);
      if (!field) return;
      const evt = field.type === 'checkbox' || field.tagName === 'SELECT' ? 'change' : 'input';

      field.addEventListener('blur', () => {
        touched.add(name);
        setFieldError(form, name, validateField(name, form));
      });

      field.addEventListener(evt, () => {
        // Refresh idempotency key once the user edits any input for a fresh inquiry
        idempotencyKey = generateKey();
        if (touched.has(name)) {
          setFieldError(form, name, validateField(name, form));
        }
      });
    });

    function showStatus(kind, title, detail, extraHtml = '') {
      if (!statusBox) return;
      statusBox.hidden = false;
      statusBox.className = `form-status is-${kind}`;
      statusBox.innerHTML = '';

      const h = document.createElement('strong');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = detail;
      statusBox.append(h, p);

      if (extraHtml) {
        const meta = document.createElement('div');
        meta.className = 'form-status-meta';
        meta.innerHTML = extraHtml;
        statusBox.appendChild(meta);
      }
    }

    function clearStatus() {
      if (!statusBox) return;
      statusBox.hidden = true;
      statusBox.className = 'form-status';
      statusBox.innerHTML = '';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isSubmitting) return;

      clearStatus();
      let firstInvalid = null;

      fieldNames.forEach((name) => {
        touched.add(name);
        const err = validateField(name, form);
        setFieldError(form, name, err);
        if (err && !firstInvalid) {
          firstInvalid = form.elements.namedItem(name);
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        showStatus(
          'error',
          'Please check the highlighted fields.',
          'Complete all required fields with valid contact information before submitting.'
        );
        return;
      }

      const payload = {
        fullName: form.elements.namedItem('fullName').value.trim(),
        workEmail: form.elements.namedItem('workEmail').value.trim(),
        phone: form.elements.namedItem('phone') ? form.elements.namedItem('phone').value.trim() : '',
        company: form.elements.namedItem('company') ? form.elements.namedItem('company').value.trim() : '',
        industry: form.elements.namedItem('industry') ? form.elements.namedItem('industry').value.trim() : '',
        siteSize: form.elements.namedItem('siteSize') ? form.elements.namedItem('siteSize').value.trim() : '',
        category: form.elements.namedItem('category').value.trim(),
        message: form.elements.namedItem('message').value.trim(),
        consent: Boolean(form.elements.namedItem('consent').checked),
        website: form.elements.namedItem('website') ? form.elements.namedItem('website').value : ''
      };

      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      form.classList.add('is-submitting');
      if (submitLabel) submitLabel.textContent = 'SENDING INQUIRY...';

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
          if (data.errors && typeof data.errors === 'object') {
            Object.entries(data.errors).forEach(([k, msg]) => {
              if (k !== '_form') setFieldError(form, k, String(msg));
            });
          }
          showStatus(
            'error',
            response.status === 409 ? 'Duplicate Inquiry Detected' : 'Unable to Submit Inquiry',
            data.error || `Server returned status ${response.status}. Please check your details and try again.`
          );
          return;
        }

        const safeId = String(data.inquiryId || '');
        const safeTime = String(data.submittedAt || '');
        const isLive = data.deliveryMode === 'live';

        showStatus(
          'success',
          isLive ? 'Inquiry Dispatched to Warhawk Aerospace' : 'Inquiry Recorded (Development Mode)',
          data.message || 'Thank you. Your inquiry has been accepted.',
          `<span class="mono">REFERENCE ID: <b>${safeId}</b></span><span class="mono">TIMESTAMP: <b>${safeTime}</b></span>`
        );

        form.reset();
        touched.clear();
        fieldNames.forEach((n) => setFieldError(form, n, ''));
        if (charCountEl) charCountEl.textContent = '0 / 3,000';
        idempotencyKey = generateKey();
      } catch {
        showStatus(
          'error',
          'Network Connection Error',
          'Could not reach the Warhawk Aerospace server. Please verify your connection or server status and retry.'
        );
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        form.classList.remove('is-submitting');
        if (submitLabel) submitLabel.textContent = 'SUBMIT INQUIRY';
      }
    });
  }

  document.querySelectorAll('[data-contact-form]').forEach(initForm);
})();

