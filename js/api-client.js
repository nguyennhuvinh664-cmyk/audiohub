(function () {
  var TOKEN_KEY = 'audiohub-auth-token';
  var BASE_KEY = 'audiohub-api-base';

  function getBaseUrl() {
    var configured = window.localStorage.getItem(BASE_KEY);
    if (configured) {
      return configured;
    }
    return 'https://create-new-project-production-9452.up.railway.app/api/v1';
  }

  function setBaseUrl(baseUrl) {
    if (!baseUrl) {
      return;
    }
    window.localStorage.setItem(BASE_KEY, String(baseUrl));
  }

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (!token) {
      window.localStorage.removeItem(TOKEN_KEY);
      return;
    }
    window.localStorage.setItem(TOKEN_KEY, String(token));
  }

  function isEnabled() {
    var token = getToken();
    if (!token) {
      return false;
    }
    // Demo mode token should not hit real backend endpoints.
    if (token === 'demo-local-token') {
      return false;
    }
    return true;
  }

  function isFormData(value) {
    return typeof FormData !== 'undefined' && value instanceof FormData;
  }

  function isPlainObject(value) {
    return value && Object.prototype.toString.call(value) === '[object Object]';
  }

  function request(path, options) {
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    var token = getToken();
    var url = getBaseUrl() + path;
    var body = opts.body;
    var hasBody = typeof body !== 'undefined' && body !== null;
    var isJsonLikeBody = hasBody && (isPlainObject(body) || Array.isArray(body));
    var responseType = String(opts.responseType || 'json').toLowerCase();

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    if (isJsonLikeBody) {
      body = JSON.stringify(body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    if (isFormData(body)) {
      delete headers['Content-Type'];
      delete headers['content-type'];
    }

    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: body
    }).then(function (res) {
      if (responseType === 'blob') {
        if (!res.ok) {
          throw new Error('Request failed: ' + res.status);
        }
        return res.blob();
      }

      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || json.success === false) {
          var message = (json && json.message) ? json.message : ('Request failed: ' + res.status);
          throw new Error(message);
        }
        return json.data;
      });
    }).catch(function (error) {
      if (error && error.message === 'Failed to fetch') {
        throw new Error('Không kết nối được backend tại ' + url + '. Hãy chạy backend và kiểm tra CORS/PORT.');
      }
      throw error;
    });
  }

  function requestBlob(path, options) {
    var opts = Object.assign({}, options || {});
    opts.responseType = 'blob';
    return request(path, opts);
  }

  window.AudioHubApi = {
    getBaseUrl: getBaseUrl,
    setBaseUrl: setBaseUrl,
    getToken: getToken,
    setToken: setToken,
    isEnabled: isEnabled,
    request: request,
    requestBlob: requestBlob
  };
})();
