// --- 設定値 ---
// APIキーをスクリプトプロパティに保存するためのキー名
const API_KEY_PROPERTY_URL = 'Maps_API_KEY'; // 関数名に合わせて変更

// スプレッドシートの列番号 (1から始まる)
const ID_COLUMN_NUMBER_URL = 1;          // A列 (ユニークID)
const QUERY_COLUMN_NUMBER_URL = 2;       // B列 (地名/検索クエリ)
const PLACE_ID_COLUMN_NUMBER_URL = 3;    // C列 (Place ID)
const NAME_COLUMN_NUMBER_URL = 4;        // D列 (検索結果名)
const PLACE_ID_URL_COLUMN_URL = 5;     // ★ E列 (Place IDベースURL) - 新規
const LAT_COLUMN_NUMBER_URL = 6;         // ★ F列 (緯度)
const LNG_COLUMN_NUMBER_URL = 7;         // ★ G列 (経度)
const LATLNG_URL_COLUMN_URL = 8;       // ★ H列 (緯度経度ベースURL) - 新規

const HEADER_ROWS_URL = 1;               // ヘッダー行の数
const JSON_FILE_BASENAME_URL = 'areas';  // Driveに保存するJSONファイルの基本名
const TARGET_FOLDER_PATH_URL = 'nm7/map'; // Driveの保存先のフォルダパス
// --- 設定値ここまで ---

/**
 * スプレッドシートを開いたときにカスタムメニューを追加します。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('データ処理(URL出力対応)') // メニュー名を変更
      .addItem('1. APIキー設定', 'showApiKeyPrompt_url')
      .addSeparator()
      .addItem('PlaceID・緯度経度・URL調整とJSONエクスポートを一括実行', 'processSheetAndExportJson_url')
      .addSeparator()
      .addItem('JSONエクスポートのみ実行 (Driveへ保存)', 'callExportSheetDataToDriveOnly_url')
      .addToUi();
}

/**
 * APIキー設定用のプロンプトを表示し、スクリプトプロパティに保存します。
 */
function showApiKeyPrompt_url() {
  const ui = SpreadsheetApp.getUi();
  const currentApiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_URL);
  const promptMessage = currentApiKey
    ? `現在のAPIキー: ${currentApiKey.substring(0, 4)}...${currentApiKey.substring(currentApiKey.length - 4)}\n新しいAPIキーを入力 (変更しない場合はキャンセル):`
    : 'Google Maps Platform APIキーを入力してください:';
  const result = ui.prompt('APIキー設定', promptMessage, ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() == ui.Button.OK) {
    const apiKey = result.getResponseText();
    if (apiKey && apiKey.trim() !== "") {
      PropertiesService.getScriptProperties().setProperty(API_KEY_PROPERTY_URL, apiKey.trim());
      ui.alert('APIキーが保存されました。');
    } else if (apiKey.trim() === "" && currentApiKey) {
       ui.alert('APIキーは変更されませんでした。');
    } else {
      ui.alert('APIキーが入力されていません。');
    }
  }
}

/**
 * 指定された検索クエリ文字列からPlace ID、名前、緯度経度を取得します。
 */
function getPlaceDetailsFromQuery_url(query) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_URL);
  if (!apiKey) throw new Error('APIキーが設定されていません。「データ処理(URL出力対応)」>「1. APIキー設定」から設定してください。');
  if (!query || query.toString().trim() === "") return { placeId: '', name: '' };
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,geometry/location&language=ja&key=${apiKey}`;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    if (response.getResponseCode() === 200 && data.status === "OK" && data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      const result = {
        placeId: candidate.place_id,
        name: candidate.name
      };
      if (candidate.geometry && candidate.geometry.location) {
        result.lat = candidate.geometry.location.lat;
        result.lng = candidate.geometry.location.lng;
      }
      return result;
    } else if (data.status === "ZERO_RESULTS") {
      Logger.log(`No results for query '${query}'`);
      return { placeId: '該当なし', name: '該当なし' };
    } else {
      Logger.log(`API Error for query '${query}': Status: ${data.status} ${data.error_message ? `- ${data.error_message}` : ''}`);
      return { placeId: `エラー: ${data.status}`, name: `エラー: ${data.status}` };
    }
  } catch (e) {
    Logger.log(`Exception fetching Place Details for query '${query}': ${e.toString()}`);
    return { placeId: '例外エラー', name: '例外エラー' };
  }
}

/**
 * 指定されたPlace IDから緯度経度を取得します (補助的な関数)。
 */
function getLatLngFromPlaceId_url_supplemental(placeId) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_URL);
  if (!apiKey) throw new Error('APIキーが設定されていません。');
  if (!placeId || placeId === '該当なし' || placeId.startsWith('エラー:')) return null;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry/location&language=ja&key=${apiKey}`;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    if (response.getResponseCode() === 200 && data.status === "OK" && data.result && data.result.geometry && data.result.geometry.location) {
      return { lat: data.result.geometry.location.lat, lng: data.result.geometry.location.lng };
    } else {
      Logger.log(`Places API Details Error for placeId '${placeId}': Status: ${data.status} ${data.error_message ? `- ${data.error_message}` : ''}`);
      return null;
    }
  } catch (e) {
    Logger.log(`Exception fetching Place Details for placeId '${placeId}': ${e.toString()}`);
    return null;
  }
}

/**
 * 指定された行のPlace ID、名前、URL、緯度経度を調整（取得・書き込み）します。
 */
function adjustPlaceInfoAndUrlsForRow_url(sheet, rowNum) { // ★関数名を変更
  const queryCell = sheet.getRange(rowNum, QUERY_COLUMN_NUMBER_URL);
  const placeIdCell = sheet.getRange(rowNum, PLACE_ID_COLUMN_NUMBER_URL);
  const nameCell = sheet.getRange(rowNum, NAME_COLUMN_NUMBER_URL);
  const placeIdUrlCell = sheet.getRange(rowNum, PLACE_ID_URL_COLUMN_URL); // ★E列
  const latCell = sheet.getRange(rowNum, LAT_COLUMN_NUMBER_URL);       // ★F列
  const lngCell = sheet.getRange(rowNum, LNG_COLUMN_NUMBER_URL);       // ★G列
  const latLngUrlCell = sheet.getRange(rowNum, LATLNG_URL_COLUMN_URL);   // ★H列

  let updated = false;
  const currentPlaceId = placeIdCell.getValue().toString().trim();
  const currentLat = latCell.getValue().toString().trim();
  const currentLng = lngCell.getValue().toString().trim();

  // Place IDが空で、検索クエリがある場合
  if (currentPlaceId === "" && queryCell.getValue().toString().trim() !== "") {
    const query = queryCell.getValue().toString().trim();
    const result = getPlaceDetailsFromQuery_url(query);
    if (result) {
      placeIdCell.setValue(result.placeId);
      nameCell.setValue(result.name);
      if (result.placeId && result.placeId !== '該当なし' && !result.placeId.startsWith('エラー:')) {
        placeIdUrlCell.setValue(`https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${result.placeId}`);
      }
      if (result.lat !== undefined && result.lng !== undefined) {
        latCell.setValue(result.lat);
        lngCell.setValue(result.lng);
        latLngUrlCell.setValue(`https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lng}`);
      }
      Utilities.sleep(200); 
      updated = true;
    }
  } else if (currentPlaceId !== "" && currentPlaceId !== '該当なし' && !currentPlaceId.startsWith('エラー:')) {
    // Place IDは既にある場合、URLや緯度経度が空なら追記
    let needsUpdate = false;
    if (placeIdUrlCell.getValue().toString().trim() === "") {
        placeIdUrlCell.setValue(`https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${currentPlaceId}`);
        needsUpdate = true;
    }
    if (currentLat === "" || currentLng === "") {
      const latLngResult = getLatLngFromPlaceId_url_supplemental(currentPlaceId);
      if (latLngResult) {
        latCell.setValue(latLngResult.lat);
        lngCell.setValue(latLngResult.lng);
        latLngUrlCell.setValue(`https://www.google.com/maps/search/?api=1&query=${latLngResult.lat},${latLngResult.lng}`);
        needsUpdate = true;
      }
    } else if (latLngUrlCell.getValue().toString().trim() === "" && currentLat !== "" && currentLng !== "") {
      // 緯度経度はあるがURLがない場合
      latLngUrlCell.setValue(`https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}`);
      needsUpdate = true;
    }
    if (needsUpdate) {
        Utilities.sleep(100); // 追記の場合は少し短めのスリープ
        updated = true;
    }
  }
  return updated;
}

/**
 * 指定されたシートの全行（ヘッダー除く）に対して情報を調整します。
 */
function adjustAllPlaceInfoAndUrls_url(sheet) { // ★関数名を変更
  if (!sheet) throw new Error('情報調整処理でシートオブジェクトが無効です。');
  const lastRow = sheet.getLastRow();
  let updatedCount = 0;
  if (lastRow <= HEADER_ROWS_URL) {
    Logger.log('No data rows found for info adjustment.');
    return updatedCount;
  }
  Logger.log('Starting Place ID, Lat/Lng, and URL adjustment...');
  for (let i = HEADER_ROWS_URL + 1; i <= lastRow; i++) {
    if(adjustPlaceInfoAndUrlsForRow_url(sheet, i)) updatedCount++; // ★呼び出し先変更
  }
  Logger.log(`Place ID, Lat/Lng, and URL adjustment completed. ${updatedCount} rows updated.`);
  return updatedCount;
}

/**
 * 指定されたパスのフォルダを取得または作成します。 (Google Drive用)
 */
function getOrCreateDriveFolder_url_(path) {
  let currentFolder = DriveApp.getRootFolder();
  const folderNames = path.split('/').filter(name => name.trim() !== '');
  for (const folderName of folderNames) {
    const folders = currentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      currentFolder = folders.next();
    } else {
      currentFolder = currentFolder.createFolder(folderName);
      Logger.log(`Drive Folder created: ${currentFolder.getName()}`);
    }
  }
  return currentFolder;
}

/**
 * 指定されたシートのデータを読み込み、JSONオブジェクトの配列に変換します。
 * (id, title, placeId, name, lat, lng を含む)
 */
function getSheetDataAsJsonArray_url(sheet) { // ★関数名を変更
  if (!sheet) throw new Error('JSON生成処理でシートオブジェクトが無効です。');
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS_URL) return [];
  
  // ★ 少なくともH列 (8列目) まで読むように調整
  const lastColumnToRead = Math.max(sheet.getLastColumn(), LATLNG_URL_COLUMN_URL); 
  const dataRange = sheet.getRange(HEADER_ROWS_URL + 1, 1, lastRow - HEADER_ROWS_URL, lastColumnToRead);
  const values = dataRange.getValues();
  const areas = [];

  values.forEach(row => {
    const id = row[ID_COLUMN_NUMBER_URL - 1];
    const title = row[QUERY_COLUMN_NUMBER_URL - 1];
    const placeId = row[PLACE_ID_COLUMN_NUMBER_URL - 1];
    const nameFromSheet = row[NAME_COLUMN_NUMBER_URL - 1];    // D列
    // E列 (PlaceID URL) はJSONに含めない
    const lat = row[LAT_COLUMN_NUMBER_URL - 1];          // F列
    const lng = row[LNG_COLUMN_NUMBER_URL - 1];          // G列
    // H列 (LatLng URL) はJSONに含めない

    if (id && id.toString().trim() !== "" && title && title.toString().trim() !== "") {
      const areaObject = {
        id: id,
        title: title,
        placeId: placeId,
        name: nameFromSheet, // D列の内容を name として使用
        lat: lat,
        lng: lng
        // description は現状含めていません。もしD列をdescriptionにしたい、または別の列を使いたい場合はここを調整
      };
      areas.push(areaObject);
    }
  });
  return areas;
}

/**
 * 指定されたシートのデータをJSON形式でGoogle Driveの特定フォルダにタイムスタンプ付きファイル名で保存します。
 */
function exportSheetDataToDrive_TimestampOnly_url(sheet) { // ★関数名を変更
  if (!sheet) {
    const errorMsg = 'JSONエクスポート処理でシートオブジェクトが無効です。';
    return { success: false, error: errorMsg };
  }
  const areasArray = getSheetDataAsJsonArray_url(sheet); // ★呼び出し先変更
  if (areasArray.length === 0) {
    return { success: false, error: 'JSONエクスポート対象のデータがありませんでした。'};
  }
  const jsonString = JSON.stringify(areasArray, null, 2);
  let timestampFilename = '';
  try {
    const targetDriveFolder = getOrCreateDriveFolder_url_(TARGET_FOLDER_PATH_URL);
    if (!targetDriveFolder) {
        return { success: false, error: `ターゲットフォルダ '${TARGET_FOLDER_PATH_URL}' の取得または作成に失敗しました。` };
    }
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");
    timestampFilename = `${JSON_FILE_BASENAME_URL}_${timestamp}.json`;
    const tsFile = targetDriveFolder.createFile(timestampFilename, jsonString, "application/json");
    Logger.log(`Timestamped File '${timestampFilename}' created in Drive folder '${targetDriveFolder.getName()}'.`);
    return { success: true, timestampFilename: timestampFilename };
  } catch (e) {
    let errorMessage = e.message || "不明なエラー";
    let errorStack = e.stack || "スタックトレースなし";
    Logger.log(`Error exporting to Drive: ${e.toString()}, Stack: ${errorStack}`);
    return { success: false, error: `Google Driveへの保存中にエラー: ${errorMessage}`, errorDetails: errorStack, timestampFilename: timestampFilename };
  }
}

/**
 * 「JSONエクスポートのみ実行」メニューから呼び出される関数
 */
function callExportSheetDataToDriveOnly_url() { // ★関数名を変更
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (!sheet) {
      ui.alert('アクティブなシートが見つかりません。処理を中止します。');
      return;
    }
    ui.alert(`JSONエクスポート処理を開始します (Google Driveの ${TARGET_FOLDER_PATH_URL} へタイムスタンプ付きファイルとして保存)。`);
    const result = exportSheetDataToDrive_TimestampOnly_url(sheet); // ★呼び出し先変更
    if (result.success) {
        ui.alert(`'${result.timestampFilename}' がGoogle Driveのフォルダ '${TARGET_FOLDER_PATH_URL}' に保存されました。`);
    } else {
        let alertMessage = `エクスポートに失敗しました: ${result.error}`;
        if (result.errorDetails) {
            alertMessage += `\n\nエラー詳細(一部):\n${result.errorDetails.substring(0, 400)}${result.errorDetails.length > 400 ? '...' : ''}`;
        }
        alertMessage += "\n\nより詳しい情報はApps Scriptエディタの実行ログを確認してください。";
        ui.alert(alertMessage);
    }
  } catch (e) {
    const errorMessage = e.message || "不明なエラー";
    Logger.log(`Error in callExportSheetDataToDriveOnly_url: ${e.toString()}`);
    ui.alert(`処理中に予期せぬエラーが発生しました: ${errorMessage}\n\n詳細はApps Scriptエディタの実行ログを確認してください。`);
  }
}

/**
 * メイン関数：Place ID・緯度経度・URL調整とJSONエクスポートを一括実行します。
 */
function processSheetAndExportJson_url() { // ★関数名を変更
  const ui = SpreadsheetApp.getUi();
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_URL);
    if (!apiKey) {
      ui.alert('APIキーが設定されていません。「データ処理(URL出力対応)」>「1. APIキー設定」から設定してください。処理を中止します。');
      return;
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (!sheet) {
      ui.alert('アクティブなシートが見つかりません。処理を中止します。');
      return;
    }
    Logger.log(`Processing sheet: ${sheet.getName()}`);
    ui.alert(`処理を開始します。\n1. Place ID, 名前, URL, 緯度経度の調整 (未入力または不足分のみ)\n2. JSONエクスポート (Google Driveの ${TARGET_FOLDER_PATH_URL} へタイムスタンプ付きファイルとして保存)\n行数によっては時間がかかる場合があります。`);

    const updatedRowsCount = adjustAllPlaceInfoAndUrls_url(sheet); // ★呼び出し先変更
    ui.alert(`情報調整が完了しました。\n${updatedRowsCount} 件の行で情報が更新/取得されました。`);

    const exportResult = exportSheetDataToDrive_TimestampOnly_url(sheet); // ★呼び出し先変更
    if (exportResult.success) {
      ui.alert(`'${exportResult.timestampFilename}' がGoogle Driveのフォルダ '${TARGET_FOLDER_PATH_URL}' に保存されました。\n全ての処理が完了しました。`);
    } else {
      let alertMessage = `JSONエクスポートに失敗しました: ${exportResult.error}`;
      if (exportResult.errorDetails) {
          alertMessage += `\n\nエラー詳細(一部):\n${exportResult.errorDetails.substring(0, 400)}${exportResult.errorDetails.length > 400 ? '...' : ''}`;
      }
      alertMessage += "\n\nより詳しい情報はApps Scriptエディタの実行ログを確認してください。\n情報調整は完了している可能性があります。";
      ui.alert(alertMessage);
    }
  } catch (e) {
    const errorMessage = e.message || "不明なエラー";
    Logger.log(`Error in processSheetAndExportJson_url: ${e.toString()}`);
    ui.alert(`処理中に予期せぬエラーが発生しました: ${errorMessage}\n\n詳細はApps Scriptエディタの実行ログを確認してください。`);
  }
}