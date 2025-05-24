// --- 設定値 ---
// APIキーをスクリプトプロパティに保存するためのキー名
const API_KEY_PROPERTY_DRIVE_TS_ONLY = 'Maps_API_KEY'; // スクリプトプロパティのキー名

// スプレッドシートの列番号 (1から始まる)
const ID_COLUMN_NUMBER_DRIVE_TS_ONLY = 1;          // A列 (ユニークID)
const QUERY_COLUMN_NUMBER_DRIVE_TS_ONLY = 2;       // B列 (地名/検索クエリ)
const PLACE_ID_COLUMN_NUMBER_DRIVE_TS_ONLY = 3;    // C列 (Place ID)
const NAME_OR_DESC_COLUMN_NUMBER_DRIVE_TS_ONLY = 4; // D列 (検索結果名 / または Description として使用)

const HEADER_ROWS_DRIVE_TS_ONLY = 1;               // ヘッダー行の数
const JSON_FILE_BASENAME_DRIVE_TS_ONLY = 'areas';  // Driveに保存するJSONファイルの基本名
const TARGET_FOLDER_PATH_DRIVE_TS_ONLY = 'nm7/map'; // Driveの保存先のフォルダパス (マイドライブからの相対パス)
// --- 設定値ここまで ---

/**
 * スプレッドシートを開いたときにカスタムメニューを追加します。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Driveエクスポート(TSのみ)')
      .addItem('1. APIキー設定', 'showApiKeyPrompt_drive_ts_only')
      .addSeparator()
      .addItem('PlaceID調整とJSONエクスポート(タイムスタンプ付 Driveへ)を一括実行', 'processSheetAndExportJsonToDrive_ts_only')
      .addSeparator()
      .addItem('JSONエクスポートのみ実行 (タイムスタンプ付 Driveへ保存)', 'callExportSheetDataToDriveOnly_ts_only')
      .addToUi();
}

/**
 * APIキー設定用のプロンプトを表示し、スクリプトプロパティに保存します。
 */
function showApiKeyPrompt_drive_ts_only() {
  const ui = SpreadsheetApp.getUi();
  const currentApiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_DRIVE_TS_ONLY);
  const promptMessage = currentApiKey
    ? `現在のAPIキー: ${currentApiKey.substring(0, 4)}...${currentApiKey.substring(currentApiKey.length - 4)}\n新しいAPIキーを入力 (変更しない場合はキャンセル):`
    : 'Google Maps Platform APIキーを入力してください:';
  const result = ui.prompt('APIキー設定', promptMessage, ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() == ui.Button.OK) {
    const apiKey = result.getResponseText();
    if (apiKey && apiKey.trim() !== "") {
      PropertiesService.getScriptProperties().setProperty(API_KEY_PROPERTY_DRIVE_TS_ONLY, apiKey.trim());
      ui.alert('APIキーが保存されました。');
    } else if (apiKey.trim() === "" && currentApiKey) {
       ui.alert('APIキーは変更されませんでした。');
    } else {
      ui.alert('APIキーが入力されていません。');
    }
  }
}

/**
 * 指定された検索クエリ文字列からPlace IDと名前を取得します。
 */
function getPlaceDetailsFromQuery_drive_ts_only(query) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_DRIVE_TS_ONLY);
  if (!apiKey) throw new Error('APIキーが設定されていません。「Driveエクスポート(TSのみ)」>「1. APIキー設定」から設定してください。');
  if (!query || query.toString().trim() === "") return { placeId: '', name: '' };
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name&language=ja&key=${apiKey}`;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    if (response.getResponseCode() === 200 && data.status === "OK" && data.candidates && data.candidates.length > 0) {
      return { placeId: data.candidates[0].place_id, name: data.candidates[0].name };
    } else if (data.status === "ZERO_RESULTS") {
      Logger.log(`No results for query '${query}'`);
      return { placeId: '該当なし', name: '該当なし' };
    } else {
      Logger.log(`API Error for query '${query}': Status: ${data.status} ${data.error_message ? `- ${data.error_message}` : ''}`);
      return { placeId: `エラー: ${data.status}`, name: `エラー: ${data.status}` };
    }
  } catch (e) {
    Logger.log(`Exception fetching Place ID for query '${query}': ${e.toString()}`);
    return { placeId: '例外エラー', name: '例外エラー' };
  }
}

/**
 * 指定された行のPlace IDを調整（取得・書き込み）します。
 */
function adjustPlaceIdForRow_drive_ts_only(sheet, rowNum) {
  const queryCell = sheet.getRange(rowNum, QUERY_COLUMN_NUMBER_DRIVE_TS_ONLY);
  const placeIdCell = sheet.getRange(rowNum, PLACE_ID_COLUMN_NUMBER_DRIVE_TS_ONLY);
  const nameOrDescCell = sheet.getRange(rowNum, NAME_OR_DESC_COLUMN_NUMBER_DRIVE_TS_ONLY);
  if (placeIdCell.getValue().toString().trim() !== "") return false;
  const query = queryCell.getValue().toString().trim();
  if (query) {
    const result = getPlaceDetailsFromQuery_drive_ts_only(query);
    if (result) {
      placeIdCell.setValue(result.placeId);
      nameOrDescCell.setValue(result.name);
      Utilities.sleep(200); 
      return true;
    }
  }
  return false;
}

/**
 * 指定されたシートの全行（ヘッダー除く）に対してPlace IDが空のものを調整します。
 */
function adjustAllEmptyPlaceIds_drive_ts_only(sheet) {
  if (!sheet) throw new Error('Place ID調整処理でシートオブジェクトが無効です。');
  const lastRow = sheet.getLastRow();
  let updatedCount = 0;
  if (lastRow <= HEADER_ROWS_DRIVE_TS_ONLY) {
    Logger.log('No data rows found for Place ID adjustment.');
    return updatedCount;
  }
  Logger.log('Starting Place ID adjustment for empty fields...');
  for (let i = HEADER_ROWS_DRIVE_TS_ONLY + 1; i <= lastRow; i++) {
    if(adjustPlaceIdForRow_drive_ts_only(sheet, i)) updatedCount++;
  }
  Logger.log(`Place ID adjustment completed. ${updatedCount} rows updated.`);
  return updatedCount;
}

/**
 * 指定されたパスのフォルダを取得または作成します。 (Google Drive用)
 */
function getOrCreateDriveFolder_drive_ts_only_(path) {
  let currentFolder = DriveApp.getRootFolder();
  const folderNames = path.split('/').filter(name => name.trim() !== '');
  for (const folderName of folderNames) {
    const folders = currentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      currentFolder = folders.next();
    } else {
      currentFolder = currentFolder.createFolder(folderName);
      Logger.log(`Drive Folder created: ${currentFolder.getName()} (ID: ${currentFolder.getId()}) under parent: ${currentFolder.getParents().hasNext() ? currentFolder.getParents().next().getName() : 'Root'}`);
    }
  }
  return currentFolder;
}

/**
 * 指定されたシートのデータを読み込み、JSONオブジェクトの配列に変換します。
 */
function getSheetDataAsJsonArray_drive_ts_only(sheet) {
  if (!sheet) throw new Error('JSON生成処理でシートオブジェクトが無効です（getSheetDataAsJsonArray_drive_ts_only）。');
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS_DRIVE_TS_ONLY) return [];
  const dataRange = sheet.getRange(HEADER_ROWS_DRIVE_TS_ONLY + 1, 1, lastRow - HEADER_ROWS_DRIVE_TS_ONLY, sheet.getLastColumn());
  const values = dataRange.getValues();
  const areas = [];
  values.forEach(row => {
    const id = row[ID_COLUMN_NUMBER_DRIVE_TS_ONLY - 1];
    const title = row[QUERY_COLUMN_NUMBER_DRIVE_TS_ONLY - 1];
    const placeId = row[PLACE_ID_COLUMN_NUMBER_DRIVE_TS_ONLY - 1];
    const descriptionFromSheet = row[NAME_OR_DESC_COLUMN_NUMBER_DRIVE_TS_ONLY - 1];
    if (id && id.toString().trim() !== "" && title && title.toString().trim() !== "") {
      areas.push({
        id: id,
        title: title,
        placeId: placeId,
        description: descriptionFromSheet
      });
    }
  });
  return areas;
}

/**
 * 指定されたシートのデータをJSON形式でGoogle Driveの特定フォルダにタイムスタンプ付きファイル名で保存します。
 * エラー詳細を強化。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 操作対象のシート。
 * @return {{success: boolean, timestampFilename?: string, error?: string, errorDetails?: string}} 処理結果。
 */
function exportSheetDataToDrive_TimestampOnly_drive_ts_only(sheet) {
  if (!sheet) {
    const errorMsg = 'JSONエクスポート処理でシートオブジェクトが無効です（nullまたはundefined）。';
    Logger.log(`Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const areasArray = getSheetDataAsJsonArray_drive_ts_only(sheet);
  if (areasArray.length === 0) {
    Logger.log('No data to export to JSON.');
    return { success: false, error: 'JSONエクスポート対象のデータがありませんでした。'};
  }
  const jsonString = JSON.stringify(areasArray, null, 2);
  
  let timestampFilename = '';

  try {
    const targetDriveFolder = getOrCreateDriveFolder_drive_ts_only_(TARGET_FOLDER_PATH_DRIVE_TS_ONLY);
    if (!targetDriveFolder) {
        const errorMsg = `ターゲットフォルダ '${TARGET_FOLDER_PATH_DRIVE_TS_ONLY}' の取得または作成に失敗しました。`;
        Logger.log(`Error: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
    Logger.log(`Target folder for Drive export: ${targetDriveFolder.getName()} (ID: ${targetDriveFolder.getId()})`);

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");
    timestampFilename = `${JSON_FILE_BASENAME_DRIVE_TS_ONLY}_${timestamp}.json`;
    
    Logger.log(`Attempting to create file: ${timestampFilename} in folder: ${targetDriveFolder.getName()}`);
    const tsFile = targetDriveFolder.createFile(timestampFilename, jsonString, "application/json");
    Logger.log(`Timestamped File '${timestampFilename}' created in Drive folder '${targetDriveFolder.getName()}'. ID: ${tsFile.getId()}`);
    
    return { 
        success: true, 
        timestampFilename: timestampFilename
    };

  } catch (e) {
    // エラーオブジェクトのプロパティを調べて、より詳細な情報を取得
    let errorMessage = e.message || "不明なエラー";
    let errorStack = e.stack || "スタックトレースなし";
    let errorName = e.name || "エラー名なし";
    let errorFileName = e.fileName || "ファイル名なし";
    let errorLineNumber = e.lineNumber || "行番号なし";

    Logger.log(`Error Name: ${errorName}`);
    Logger.log(`Error Message: ${errorMessage}`);
    Logger.log(`Error Stack: ${errorStack}`);
    Logger.log(`Error File: ${errorFileName}`);
    Logger.log(`Error Line: ${errorLineNumber}`);
    Logger.log(`Full Error Object (stringified): ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`); // エラーオブジェクトの全プロパティを出力

    // UIアラートには主要な情報を表示
    const detailedErrorString = `タイプ: ${errorName}\nメッセージ: ${errorMessage}\nファイル: ${errorFileName}\n行: ${errorLineNumber}`;
    
    return { 
        success: false, 
        error: `Google Driveへの保存中にエラーが発生しました。詳細はログを確認してください。`,
        errorDetails: detailedErrorString, // UIアラートで表示するための詳細
        timestampFilename: timestampFilename 
    };
  }
}

/**
 * 「JSONエクスポートのみ実行」メニューから呼び出される関数
 * エラー表示を強化
 */
function callExportSheetDataToDriveOnly_ts_only() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (!sheet) {
      ui.alert('アクティブなシートが見つかりません。処理を中止します。');
      return;
    }
    ui.alert(`JSONエクスポート処理を開始します (Google Driveの ${TARGET_FOLDER_PATH_DRIVE_TS_ONLY} へタイムスタンプ付きファイルとして保存)。`);
    const result = exportSheetDataToDrive_TimestampOnly_drive_ts_only(sheet);
    
    if (result.success) {
        ui.alert(`'${result.timestampFilename}' がGoogle Driveのフォルダ '${TARGET_FOLDER_PATH_DRIVE_TS_ONLY}' に保存されました。`);
    } else {
        let alertMessage = `エクスポートに失敗しました: ${result.error}`;
        if (result.errorDetails) {
            // アラートの文字数制限を考慮し、errorDetails全体ではなく主要部分のみ表示
            alertMessage += `\n\nエラー詳細:\n${result.errorDetails.substring(0, 400)}${result.errorDetails.length > 400 ? '...' : ''}`;
        }
        alertMessage += "\n\nより詳しい情報はApps Scriptエディタの実行ログを確認してください。";
        ui.alert(alertMessage);
    }
  } catch (e) {
    const errorMessage = e.message || "不明なエラー";
    const errorStack = e.stack || "スタックトレースなし";
    Logger.log(`Error in callExportSheetDataToDriveOnly_ts_only: ${e.toString()}`);
    Logger.log(`Stack: ${errorStack}`);
    let alertMessage = `処理中に予期せぬエラーが発生しました: ${errorMessage}`;
    alertMessage += `\n\n詳細はApps Scriptエディタの実行ログを確認してください。`;
    ui.alert(alertMessage);
  }
}

/**
 * メイン関数：Place ID調整とJSONエクスポートを一括実行します。
 * エラー表示を強化
 */
function processSheetAndExportJsonToDrive_ts_only() {
  const ui = SpreadsheetApp.getUi();
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY_DRIVE_TS_ONLY);
    if (!apiKey) {
      ui.alert('APIキーが設定されていません。「Driveエクスポート(TSのみ)」>「1. APIキー設定」から設定してください。処理を中止します。');
      return;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (!sheet) {
      ui.alert('アクティブなシートが見つかりません。処理を中止します。');
      return;
    }
    Logger.log(`Processing sheet: ${sheet.getName()}`);

    ui.alert(`処理を開始します。\n1. Place IDの調整 (未入力のみ)\n2. JSONエクスポート (Google Driveの ${TARGET_FOLDER_PATH_DRIVE_TS_ONLY} へタイムスタンプ付きファイルとして保存)\n行数によっては時間がかかる場合があります。`);

    const updatedRowsCount = adjustAllEmptyPlaceIds_drive_ts_only(sheet);
    ui.alert(`Place IDの調整が完了しました。\n${updatedRowsCount} 件のPlace IDが更新/取得されました。`);

    const exportResult = exportSheetDataToDrive_TimestampOnly_drive_ts_only(sheet);
    if (exportResult.success) {
      ui.alert(`'${exportResult.timestampFilename}' がGoogle Driveのフォルダ '${TARGET_FOLDER_PATH_DRIVE_TS_ONLY}' に保存されました。\n全ての処理が完了しました。`);
    } else {
      let alertMessage = `JSONエクスポートに失敗しました: ${exportResult.error}`;
      if (exportResult.errorDetails) {
          alertMessage += `\n\nエラー詳細:\n${exportResult.errorDetails.substring(0, 400)}${exportResult.errorDetails.length > 400 ? '...' : ''}`;
      }
      alertMessage += "\n\nより詳しい情報はApps Scriptエディタの実行ログを確認してください。\nPlace IDの調整は完了している可能性があります。";
      ui.alert(alertMessage);
    }
  } catch (e) {
    const errorMessage = e.message || "不明なエラー";
    const errorStack = e.stack || "スタックトレースなし";
    Logger.log(`Error in processSheetAndExportJsonToDrive_ts_only: ${e.toString()}`);
    Logger.log(`Stack: ${errorStack}`);
    let alertMessage = `処理中に予期せぬエラーが発生しました: ${errorMessage}`;
    alertMessage += `\n\n詳細はApps Scriptエディタの実行ログを確認してください。`;
    ui.alert(alertMessage);
  }
}