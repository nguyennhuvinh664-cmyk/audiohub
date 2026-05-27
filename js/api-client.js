(function () {
  var TOKEN_KEY = 'audiohub-auth-token';
  var BASE_KEY = 'audiohub-api-base';

  function getBaseUrl() {
    var configured = window.localStorage.getItem(BASE_KEY);
    if (configured) {
      return configured;
    }
    return 'http://localhost:4000/api/v1';
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
    return !!getToken();
  }

  function request(path, options) {
    var opts = options || {};
    var headers = opts.headers || {};
    var token = getToken();
    var url = getBaseUrl() + path;

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body
    }).then(function (res) {
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

  window.AudioHubApi = {
    getBaseUrl: getBaseUrl,
    setBaseUrl: setBaseUrl,
    getToken: getToken,
    setToken: setToken,
    isEnabled: isEnabled,
    request: request
  };
})();
