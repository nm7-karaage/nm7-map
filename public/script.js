let allLocations = [];
let map = null;
let userMarker = null;

async function initMap() {
  const res = await fetch('https://nm7-map.web.app/areas.json');
  allLocations = await res.json();

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 35.681236, lng: 139.767125 },
    zoom: 6,
    zoomControl: true
  });

  allLocations.forEach((loc) => {
    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: map,
      title: loc.title,
    });

    const info = new google.maps.InfoWindow({
      content: `<strong>${loc.title}</strong><br>${loc.description}`,
    });

    marker.addListener('click', () => {
      info.open(map, marker);
    });
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      map.setCenter({ lat, lng });
      map.setZoom(14);

      userMarker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: "あなたの現在地",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#fff'
        }
      });
    }, (err) => {
      console.warn("位置情報が取得できません: " + err.message);
    }, { enableHighAccuracy: true });
  }
}

function checkProximity() {
  if (!navigator.geolocation) {
    alert("位置情報が取得できません");
    return;
  }

  navigator.geolocation.getCurrentPosition((pos) => {
    const userLat = pos.coords.latitude;
    const userLng = pos.coords.longitude;

    if (userMarker) {
      userMarker.setPosition({ lat: userLat, lng: userLng });
    } else {
      userMarker = new google.maps.Marker({
        position: { lat: userLat, lng: userLng },
        map: map,
        title: "あなたの現在地",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#fff'
        }
      });
    }

    const near = allLocations.find(loc => {
      const d = getDistance(userLat, userLng, loc.lat, loc.lng);
      return d < 500;
    });

    if (near) {
      showBanner(`🎯 近くに「${near.title}」があります！`);
    } else {
      showBanner("🎯 近くに聖地はありません");
    }
  }, (err) => {
    alert("位置情報が取得できませんでした: " + err.message);
  }, { enableHighAccuracy: true });
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = x => (x * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a = Math.sin(Δφ/2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function showBanner(message) {
  const alert = document.getElementById('alert');
  alert.textContent = message;
  alert.style.display = 'block';
}
