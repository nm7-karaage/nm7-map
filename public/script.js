let allLocations = [];
let map = null;
let userMarker = null;
const DETECTION_RADIUS_METERS = 500;

async function initMap() {
  const res = await fetch('https://nm7-map.web.app/areas.json');
  allLocations = await res.json();

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 35.681236, lng: 139.767125 },
    zoom: 6,
    zoomControl: true
  });

  const service = new google.maps.places.PlacesService(map);

  allLocations.forEach((loc) => {
    service.getDetails(
      {
        placeId: loc.place_id,
        fields: ['name', 'geometry', 'photos']
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          const marker = new google.maps.Marker({
            position: place.geometry.location,
            map,
            title: loc.title
          });

          const info = new google.maps.InfoWindow({
            content: `
              <div style="min-width:200px">
                ${place.photos?.[0]?.getUrl ? `<img src="${place.photos[0].getUrl()}" style="width:100%; border-radius:8px; margin-bottom:8px;">` : ""}
                <strong>${loc.title}</strong><br>${loc.description}
              </div>
            `
          });

          marker.addListener("click", () => {
            info.open(map, marker);
          });
        }
      }
    );
  });

  locateAndCenterMap();
}

function locateAndCenterMap() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    map.setCenter({ lat, lng });
    map.setZoom(14);
    updateUserMarker(lat, lng);
  }, (err) => {
    console.warn("位置情報が取得できません: " + err.message);
  }, { enableHighAccuracy: true });
}

function checkProximity() {
  if (!navigator.geolocation) {
    alert("位置情報が取得できません");
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: userLat, longitude: userLng } = pos.coords;
    updateUserMarker(userLat, userLng);

    // 近くのスポット検索はダミー（place_idベースなので距離検索非対応）
    showBanner("📍 近くの聖地チェックはplace_idモードでは未対応です");
  }, (err) => {
    alert("位置情報が取得できませんでした: " + err.message);
  }, { enableHighAccuracy: true });
}

function updateUserMarker(lat, lng) {
  const pos = { lat, lng };
  if (userMarker) {
    userMarker.setPosition(pos);
  } else {
    userMarker = new google.maps.Marker({
      position: pos,
      map,
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
}

function showBanner(message) {
  const alert = document.getElementById('alert');
  alert.textContent = message;
  alert.style.display = 'block';
}
