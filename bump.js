const https = require('https');
const fs = require('fs');

// ─── Configuration ────────────────────────────────────────────────────────────
const THREAD_ID = '1901057';
const BASE_URL  = 'cracked.ax';

// Lire les cookies depuis le Secret GitHub (env) ou fichier local
const cookiesSource = process.env.COOKIES_JSON || fs.readFileSync('cookies.json', 'utf8');
const rawCookies = JSON.parse(cookiesSource);

// Convertir les cookies en string pour le header HTTP
const cookieHeader = rawCookies
  .map(c => `${c.name}=${c.value}`)
  .join('; ');

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `https://${BASE_URL}/Thread-SIGNATURE-SPOTS-FOR-SALE--${THREAD_ID}`,
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getPostKey() {
  console.log('📄 Chargement de la page du thread pour récupérer le post_key...');
  const res = await httpGet(`/Thread-SIGNATURE-SPOTS-FOR-SALE--${THREAD_ID}`);
  console.log('⏳ Attente 60 secondes pour que la page charge complètement...');
  await wait(60000);

  if (res.status !== 200) {
    throw new Error(`Page non chargée — statut HTTP: ${res.status}`);
  }

  const match = res.body.match(/my_post_key=([a-f0-9]{32})/);
  if (!match) {
    if (res.body.includes('You are not logged in')) {
      throw new Error('❌ Non connecté — cookies invalides ou expirés.');
    }
    throw new Error('❌ my_post_key introuvable dans la page.');
  }

  console.log(`🔑 post_key trouvé: ${match[1]}`);
  return match[1];
}

async function bumpThread(postKey) {
  const path = `/mod.php?tid=${THREAD_ID}&action=bump_thread&my_post_key=${postKey}`;
  console.log('⏳ Attente 60 secondes avant d\'envoyer le bump...');
  await wait(60000);
  console.log(`🚀 Envoi du bump: ${path}`);

  const res = await httpGet(path);

  if (res.status === 200 || res.status === 302) {
    console.log('✅ Bump envoyé avec succès !');
    return true;
  } else {
    throw new Error(`❌ Réponse inattendue — statut HTTP: ${res.status}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n🔄 Tentative ${attempt}/${MAX_RETRIES}...`);
    try {
      const postKey = await getPostKey();
      await bumpThread(postKey);
      console.log('🎉 Thread bumped avec succès !');
      process.exit(0);
    } catch (err) {
      console.error(`⛔ Tentative ${attempt} échouée : ${err.message}`);
      if (attempt === MAX_RETRIES) {
        console.error('❌ Échec définitif après toutes les tentatives.');
        process.exit(1);
      }
      console.log('⏳ Attente 60 secondes avant retry...');
      await wait(60000);
    }
  }
})();
