// script.js

let allLocations = [];
let map = null;
let userMarker = null;
const DETECTION_RADIUS_KM = 5; // 検索半径をkmで定義 (例: 5km)

async function initMap() {
  try {
    // areas.json には、id, title, placeId, description, lat, lng が含まれている想定
    const res = await fetch('https://nm7-map.web.app/areas.json');
    if (!res.ok) {
      throw new Error(`Failed to fetch areas.json: ${res.status} ${res.statusText}`);
    }
    allLocations = await res.json();
  } catch (error) {
    console.error("Error loading or parsing areas.json:", error);
    showBanner("聖地データの読み込みに失敗しました。ページを再読み込みしてください。");
    allLocations = []; // エラー時は空の配列として処理を継続
  }

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 35.681236, lng: 139.767125 }, // 東京駅あたりを中心
    zoom: 6, // 初期ズームレベル
    mapTypeControl: false,
    streetViewControl: false
  });

  const placesService = new google.maps.places.PlacesService(map);
  let activeInfoWindow = null; // 現在開いている情報ウィンドウを管理

  allLocations.forEach((loc) => {
    // lat, lng が数値であり、有効な範囲にあるか基本的なチェック
    if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number' ||
        loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) {
      console.warn("Invalid or missing lat/lng for location:", loc.title, loc);
      // lat/lngが無効な場合、マーカーを立てないか、エラー処理を行う
      // 今回はスキップして次の場所へ
      return;
    }

    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: map,
      title: loc.title
    });

    marker.addListener("click", () => {
      if (activeInfoWindow) {
        activeInfoWindow.close(); // 既に開いているウィンドウがあれば閉じる
      }

      // 情報ウィンドウの基本コンテンツ (写真なしの状態)
      let contentString = `
        <div style="min-width:200px; max-width: 300px; padding: 5px; font-family: sans-serif;">
          <strong>${loc.title}</strong>
          <p style="margin-top: 5px; margin-bottom: 0;">${loc.description || ''}</p>
          <div id="iw-photo-${loc.placeId}" style="margin-top: 8px;">
            <small>写真情報を読み込み中...</small>
          </div>
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({
        content: contentString
      });
      infoWindow.open(map, marker);
      activeInfoWindow = infoWindow;

      // Place IDがあれば写真を取得して情報ウィンドウを更新
      if (loc.placeId && loc.placeId !== '該当なし' && !loc.placeId.startsWith('エラー:')) {
        placesService.getDetails({
          placeId: loc.placeId,
          fields: ['name', 'photos'] // 写真と名前（タイトル確認用）をリクエスト
        }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            let photoHtml = '<small>写真はありません。</small>'; // デフォルトメッセージ
            if (place.photos && place.photos.length > 0) {
              const photoUrl = place.photos[0].getUrl({ maxWidth: 280, maxHeight: 180 }); // サイズ調整
              photoHtml = `<img src="${photoUrl}" alt="${place.name || loc.title}" style="width:100%; max-height: 180px; object-fit: cover; border-radius:8px;">`;
            }

            // 現在開いている情報ウィンドウのコンテンツを更新（写真部分のみ）
            // 注意: infoWindow.getContent() で既存コンテンツを取得して一部置換するのは複雑なので、
            //       写真表示用のプレースホルダーDOM要素を特定して内容を書き換える
            const photoDiv = document.getElementById(`iw-photo-${loc.placeId}`);
            if (photoDiv && infoWindow.getMap()) { // photoDiv が存在し、かつウィンドウが開いている場合のみ更新
                 photoDiv.innerHTML = photoHtml;
            } else if (infoWindow.getMap()) { // ウィンドウは開いているが、何らかの理由でphotoDivが特定できない場合 (稀)
                // コンテンツ全体を再構築して設定することもできるが、ちらつきの原因になる可能性
                const updatedContentString = `
                    <div style="min-width:200px; max-width: 300px; padding: 5px; font-family: sans-serif;">
                      ${photoHtml}
                      <strong>${place.name || loc.title}</strong>
                      <p style="margin-top: 5px; margin-bottom: 0;">${loc.description || ''}</p>
                    </div>
                  `;
                infoWindow.setContent(updatedContentString);
            }
          } else {
            Logger.warn(`Place Details (photos) request failed for ${loc.title} (Place ID: ${loc.placeId}). Status: ${status}`);
            const photoDiv = document.getElementById(`iw-photo-${loc.placeId}`);
            if (photoDiv && infoWindow.getMap()) {
                 photoDiv.innerHTML = '<small>写真情報の取得に失敗しました。</small>';
            }
          }
        });
      } else {
        // Place IDがない場合は写真なし
        const photoDiv = document.getElementById(`iw-photo-${loc.placeId}`); // placeIdがない場合、このIDは不適切になる可能性
        if (photoDiv && infoWindow.getMap()) { // このIDのdivは存在しないはずなので、より一般的なセレクタが必要かも
             photoDiv.innerHTML = '<small>写真情報はありません (Place IDなし)。</small>';
        } else if (document.querySelector(`#iw-photo-${loc.id}`) && infoWindow.getMap()){ // 代わりに loc.id を使う
             const photoDivById = document.querySelector(`#iw-photo-${loc.id}`);
             if(photoDivById) photoDivById.innerHTML = '<small>写真情報はありません (Place IDなし)。</small>';
        }
        Logger.warn(`No Place ID for location: ${loc.title}. Cannot fetch photos.`);
      }
    });
  });

  locateAndCenterMap();
}

function locateAndCenterMap() {
  if (!navigator.geolocation) {
    showBanner("お使いのブラウザでは位置情報を取得できません。");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setCenter({ lat, lng });
      map.setZoom(14);
      updateUserMarker(lat, lng);
    },
    (err) => {
      console.warn("位置情報が取得できません: " + err.message);
      showBanner("位置情報が取得できませんでした。設定を確認してください。");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * Haversine公式を使って2点間の距離をkmで計算します。
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球の半径 (km)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // 距離 (km)
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function checkProximity() {
  if (!navigator.geolocation) {
    showBanner("お使いのブラウザでは位置情報を取得できません。");
    return;
  }
  if (allLocations.length === 0) {
    showBanner("聖地データが読み込まれていません。");
    return;
  }

  showBanner("現在地を取得し、近くの聖地を検索中...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: userLat, longitude: userLng } = pos.coords;
      updateUserMarker(userLat, userLng);
      map.setCenter({ lat: userLat, lng: userLng });
      map.setZoom(13);

      const nearbyLocations = [];
      allLocations.forEach(loc => {
        if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
          return;
        }
        const distance = getDistanceFromLatLonInKm(userLat, userLng, loc.lat, loc.lng);
        if (distance <= DETECTION_RADIUS_KM) {
          nearbyLocations.push({ ...loc, distance: distance });
        }
      });

      if (nearbyLocations.length > 0) {
        nearbyLocations.sort((a, b) => a.distance - b.distance);

        let message = `近くの聖地 (${DETECTION_RADIUS_KM}km以内):\n`;
        nearbyLocations.slice(0, 5).forEach(loc => {
          message += `- ${loc.title} (約${loc.distance.toFixed(1)}km)\n`;
        });
        if (nearbyLocations.length > 5) {
          message += `他 ${nearbyLocations.length - 5}件...`;
        }
        showBanner(message, true);
      } else {
        showBanner(`現在地の${DETECTION_RADIUS_KM}km以内に聖地は見つかりませんでした。`);
      }
    },
    (err) => {
      console.warn("位置情報が取得できませんでした: " + err.message);
      showBanner("位置情報が取得できませんでした: " + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
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
        strokeColor: '#ffffff'
      },
      zIndex: 999
    });
  }
}

function showBanner(message, isMultiline = false) {
  const alertElement = document.getElementById('alert');
  if (!alertElement) {
      console.warn("Banner element with ID 'alert' not found.");
      // フォールバックとしてブラウザのalertを使う (必要に応じて)
      // if (typeof alert === 'function') alert(message);
      return;
  }
  if (isMultiline) {
    alertElement.style.whiteSpace = 'pre-wrap';
    alertElement.style.textAlign = 'left';
  } else {
    alertElement.style.whiteSpace = 'normal';
    alertElement.style.textAlign = 'center';
  }
  alertElement.textContent = message;
  alertElement.style.display = 'block';
}