// 인사 시스템 (M3.6)
// - 시간대 + 날씨 기반 인사
// - Open-Meteo API (인증키 X, 무료, 합법, 회사 인계 안전)
// - 평택항 좌표 고정
// - TTS 음성 출력

const PYEONGTAEK_LAT = 36.9826;
const PYEONGTAEK_LON = 126.8244;

// Open-Meteo API에서 평택항 현재 날씨 + 시간별 예보 조회
export async function fetchPyeongtaekWeather() {
  try {
    // M3.68: 현재 + 12시간 예보 함께 조회
    // M3.88 fix: wind_speed_unit=ms 명시 (기본 km/h라 12km/h=3.3m/s를 강풍으로 오판하던 버그)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${PYEONGTAEK_LAT}&longitude=${PYEONGTAEK_LON}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m&forecast_hours=12&timezone=Asia%2FSeoul&wind_speed_unit=ms`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('weather api ' + res.status);
    const data = await res.json();
    const c = data.current;
    const h = data.hourly;
    return {
      temp: c.temperature_2m,
      windSpeed: c.wind_speed_10m,
      precipitation: c.precipitation,
      weatherCode: c.weather_code,
      humidity: c.relative_humidity_2m,
      time: c.time,
      // 시간별 예보 (현재 시각부터 12시간)
      hourly: h ? h.time.map((t, i) => ({
        time: t,
        temp: h.temperature_2m[i],
        weatherCode: h.weather_code[i],
        precipitation: h.precipitation[i],
        windSpeed: h.wind_speed_10m[i],
      })) : [],
    };
  } catch (e) {
    console.warn('[weather] 날씨 조회 실패:', e);
    return null;
  }
}

// WMO weather code → 한국어 설명
//   https://open-meteo.com/en/docs (WMO Weather interpretation codes)
function describeWeather(code) {
  if (code === 0) return { label: '맑음', emoji: '☀️', kind: 'clear' };
  if (code === 1 || code === 2) return { label: '대체로 맑음', emoji: '🌤', kind: 'partly' };
  if (code === 3) return { label: '흐림', emoji: '☁️', kind: 'cloudy' };
  if (code === 45 || code === 48) return { label: '안개', emoji: '🌫', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: '이슬비', emoji: '🌦', kind: 'drizzle' };
  if (code >= 61 && code <= 67) return { label: '비', emoji: '🌧', kind: 'rain' };
  if (code >= 71 && code <= 77) return { label: '눈', emoji: '❄️', kind: 'snow' };
  if (code >= 80 && code <= 82) return { label: '소나기', emoji: '🌦', kind: 'rain' };
  if (code >= 85 && code <= 86) return { label: '눈 소나기', emoji: '❄️', kind: 'snow' };
  if (code >= 95 && code <= 99) return { label: '천둥번개', emoji: '⛈', kind: 'thunder' };
  return { label: '날씨 정보', emoji: '🌍', kind: 'unknown' };
}

// 시간대 분류
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

// M3.68: 예보 변화 멘트 (듣기 좋게)
// hourly 12시간 데이터에서 의미있는 변화 찾아 한 줄로 요약
function buildForecastNarration(hourly, currentKind) {
  if (!hourly || hourly.length < 2) return '';

  // 1) 위험 기상 시작 (천둥/눈/강풍/호우)
  for (let i = 1; i < hourly.length; i++) {
    const h = hourly[i];
    const w = describeWeather(h.weatherCode);
    const t = new Date(h.time);
    const hourStr = t.getHours();

    if (w.kind === 'thunder') {
      return `⚠️ ${hourStr}시쯤 천둥번개 예보 - 작업 안전 주의`;
    }
    if (w.kind === 'snow') {
      return `❄️ ${hourStr}시쯤 눈 소식 - 미끄럼 주의`;
    }
    if (h.windSpeed >= 12) {
      return `💨 ${hourStr}시쯤 강풍 ${Math.round(h.windSpeed)}m/s - 안전 주의`;
    }
    if (h.precipitation >= 5) {
      return `🌧 ${hourStr}시쯤 비 강해질 예정 (${h.precipitation.toFixed(0)}mm)`;
    }
  }

  // 2) 비/이슬비 시작 (현재 안 오는데 예보에 있음)
  if (currentKind === 'clear' || currentKind === 'partly' || currentKind === 'cloudy') {
    for (let i = 1; i < hourly.length; i++) {
      const h = hourly[i];
      const w = describeWeather(h.weatherCode);
      if (w.kind === 'rain' || w.kind === 'drizzle' || h.precipitation >= 0.5) {
        const hourStr = new Date(h.time).getHours();
        return `☔ ${hourStr}시쯤 비 소식이 있어요. 우비 챙기세요`;
      }
    }
  }

  // 3) 비 그침 (현재 비 오는데 예보에 멈춤)
  if (currentKind === 'rain' || currentKind === 'drizzle') {
    for (let i = 1; i < hourly.length; i++) {
      const h = hourly[i];
      const w = describeWeather(h.weatherCode);
      if (w.kind !== 'rain' && w.kind !== 'drizzle' && h.precipitation < 0.3) {
        const hourStr = new Date(h.time).getHours();
        return `🌤 ${hourStr}시쯤 비 그칠 예정. 조금만 더 힘내세요`;
      }
    }
  }

  // 4) 기온 큰 변화 (10도 이상)
  const temps = hourly.map(h => h.temp);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  if (maxT - minT >= 10) {
    return `🌡 기온 변화 큰 날 (${Math.round(minT)}°C ~ ${Math.round(maxT)}°C). 옷 차림 신경 쓰세요`;
  }

  // 5) 평온
  return '✨ 앞으로 평온한 날씨예요';
}

// M3.68: 8시간 근무 시간대 예보 라인 생성
// 접속 시점부터 2~3시간 간격으로 4~5개 표시
function buildWorkHoursForecast(hourly) {
  if (!hourly || hourly.length === 0) return [];

  const lines = [];
  const indexes = [0, 3, 6, 9];
  for (const i of indexes) {
    if (i >= hourly.length) break;
    const h = hourly[i];
    const t = new Date(h.time);
    const w = describeWeather(h.weatherCode);
    const hour = t.getHours().toString().padStart(2, '0');

    let note = '';
    if (h.precipitation >= 5) note = ' ⚠️ 호우';
    else if (h.precipitation >= 1) note = ` ${h.precipitation.toFixed(0)}mm`;
    else if (h.windSpeed >= 12) note = ` ⚠️ 강풍`;
    else if (h.windSpeed >= 8) note = ` 💨${Math.round(h.windSpeed)}m/s`;

    lines.push(`${hour}시  ${w.emoji} ${Math.round(h.temp)}°C${note}`);
  }
  return lines;
}

// 로그인 인사 메시지 생성
export function buildGreetingMessage(name, weather) {
  const now = new Date();
  const hour = now.getHours();
  const tod = getTimeOfDay(hour);

  // 시간대별 인사
  const greetings = {
    dawn:      ['☀️ 좋은 아침입니다', '🌅 오늘도 안전 검수 부탁드립니다'],
    morning:   ['🌞 좋은 하루 보내세요', '💪 오전 작업 화이팅입니다'],
    lunch:     ['🍱 점심 드셨나요?', '🥤 물 충분히 드세요'],
    afternoon: ['🌤 오후 작업도 안전하게', '☕ 커피 한 잔 어떠세요?'],
    evening:   ['🌆 오늘도 수고 많으십니다', '🌙 저녁 작업 안전 주의'],
    night:     ['🌙 야간 근무 정말 수고 많으십니다', '⭐ 안전이 최우선입니다'],
  };
  const tg = greetings[tod] || greetings.morning;
  const greeting = tg[Math.floor(Math.random() * tg.length)];

  let weatherLine = '';

  if (weather) {
    const w = describeWeather(weather.weatherCode);
    const t = weather.temp;
    const wind = weather.windSpeed;
    const rain = weather.precipitation;

    // 위험 기상 우선
    if (w.kind === 'thunder') {
      weatherLine = '⛈ 천둥번개! 위험 기상 - 작업 중단 검토 필요';
    } else if (wind >= 12) {
      weatherLine = `💨 강풍 ${wind.toFixed(0)}m/s - 안전 주의!`;
    } else if (rain >= 5) {
      weatherLine = `🌧 비 ${rain.toFixed(0)}mm/h - 미끄럼 주의`;
    } else if (w.kind === 'snow') {
      weatherLine = `❄️ 눈 - 미끄럼 매우 주의`;
    } else if (w.kind === 'rain' || w.kind === 'drizzle') {
      weatherLine = `${w.emoji} ${w.label} - 우비 챙기세요`;
    } else if (w.kind === 'fog') {
      weatherLine = `🌫 안개 - 시야 확보 주의`;
    } else if (t >= 30) {
      const windInfo = wind >= 5 ? ` · 바람 ${wind.toFixed(0)}m/s` : '';
      weatherLine = `🥵 ${t.toFixed(0)}°C 더위${windInfo} - 수분 보충 잊지 마세요`;
    } else if (t <= 0) {
      const windInfo = wind >= 5 ? ` · 바람 ${wind.toFixed(0)}m/s` : '';
      weatherLine = `🥶 ${t.toFixed(0)}°C 추위${windInfo} - 따뜻하게 입으세요`;
    } else if (t <= 5) {
      const windInfo = wind >= 5 ? ` · 바람 ${wind.toFixed(0)}m/s` : '';
      weatherLine = `❄️ ${t.toFixed(0)}°C 쌀쌀${windInfo} - 따뜻하게`;
    } else {
      // M3.88: 평온한 날씨에도 풍속 정보 표시 (작업 도움)
      const windInfo = wind >= 5 ? ` · 바람 ${wind.toFixed(0)}m/s` : '';
      weatherLine = `${w.emoji} ${w.label} ${t.toFixed(0)}°C${windInfo}`;
    }
  }

  const lines = [
    `안녕하세요!`,
    greeting,
  ];
  if (weatherLine) lines.push(weatherLine);

  // M3.68: 예보 변화 멘트 (듣기 좋게)
  let forecastLine = '';
  if (weather && weather.hourly && weather.hourly.length > 0) {
    const w = describeWeather(weather.weatherCode);
    forecastLine = buildForecastNarration(weather.hourly, w.kind);
    if (forecastLine) {
      lines.push(forecastLine);
    }
  }

  // M3.68: 근무 시간대 예보 라인 (8~9시간)
  const workForecast = weather ? buildWorkHoursForecast(weather.hourly) : [];

  return {
    lines,                          // 화면 표시용
    workForecast,                   // M3.68: 근무 시간대 예보 라인 배열
    timeOfDay: tod,
    weather,
  };
}

// 로그아웃 인사 메시지 생성
export function buildFarewellMessage(name, weather, workDurationMs) {
  const now = new Date();
  const hour = now.getHours();
  const tod = getTimeOfDay(hour);

  const lines = [`수고하셨어요!`];

  // 작업 시간이 길었으면 강조
  if (workDurationMs && workDurationMs > 0) {
    const hours = workDurationMs / (1000 * 60 * 60);
    if (hours >= 8) {
      lines.push(`⏰ 오늘 ${hours.toFixed(1)}시간 작업하셨습니다`);
    } else if (hours >= 6) {
      lines.push(`⏰ 오늘 ${hours.toFixed(1)}시간 정말 수고하셨어요`);
    }
  }

  // 시간대별 마무리
  if (tod === 'night') {
    lines.push('🌙 안전 귀가하세요');
  } else if (tod === 'evening') {
    lines.push('🌆 푹 쉬세요');
  } else if (tod === 'dawn' || tod === 'morning') {
    lines.push('🌟 일찍 끝나셨네요! 좋은 하루 되세요');
  } else {
    lines.push('☕ 잠시 쉬세요');
  }

  // 날씨 기반 마무리
  if (weather) {
    const w = describeWeather(weather.weatherCode);
    const t = weather.temp;

    if (w.kind === 'thunder') {
      lines.push('⛈ 위험 기상에 정말 고생 많으셨어요');
    } else if (w.kind === 'rain' || w.kind === 'drizzle') {
      lines.push('☔ 비 조심해서 귀가하세요');
    } else if (w.kind === 'snow') {
      lines.push('❄️ 눈길 미끄럼 주의 귀가하세요');
    } else if (t >= 30) {
      lines.push('🥵 더위에 정말 고생 많으셨어요. 시원한 물 한 잔!');
    } else if (t <= 0) {
      lines.push('🥶 추위에 수고 많으셨어요. 따뜻한 곳에서 쉬세요');
    }
  }

  return {
    lines,
    workHours: workDurationMs ? (workDurationMs / 1000 / 60 / 60) : 0,
  };
}

// 음성 출력 (Web Speech API) - M3.6-fix3: 밝고 청아한 목소리
export function speakGreeting(text) {
  if (!('speechSynthesis' in window)) return;
  if (!text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 1.1;       // 약간 빠르게 (낭랑하게)
    utter.pitch = 1.4;      // 높이 (밝고 청아하게)
    utter.volume = 1.0;

    // 한국어 여성 음성 우선 선택 (밝은 음색)
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      // 우선순위: 한국어 여성 > 한국어 > 시스템 기본
      const koVoices = voices.filter(v => v.lang && v.lang.startsWith('ko'));
      // 여성 음성 찾기 (이름에 "Female", "Heami", "Yuna", "Sora", "Sun-Hi" 등)
      const female = koVoices.find(v =>
        /female|heami|yuna|sora|sun-hi|seoyeon|jiwon|innai|narae/i.test(v.name)
      );
      const koVoice = female || koVoices[0];
      if (koVoice) utter.voice = koVoice;
    }

    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('[speakGreeting] 음성 출력 실패:', e);
  }
}

// 로그인 시각 저장 (작업 시간 계산용)
export function saveLoginTime(name) {
  try {
    localStorage.setItem('gm_login_time', String(Date.now()));
    localStorage.setItem('gm_login_inspector', name);
  } catch (e) {}
}

export function getLoginTime() {
  try {
    const t = localStorage.getItem('gm_login_time');
    return t ? Number(t) : 0;
  } catch (e) { return 0; }
}

export function clearLoginTime() {
  try {
    localStorage.removeItem('gm_login_time');
    localStorage.removeItem('gm_login_inspector');
  } catch (e) {}
}
