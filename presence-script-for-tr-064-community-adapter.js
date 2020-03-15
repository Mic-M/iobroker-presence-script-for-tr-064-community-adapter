/*******************************************************************************
 * ---------------------------
 * Script: An- und Abwesenheitserkennung über TR-064-Community-Adapter
 * ---------------------------
 * Autor: Mic (ioBroker-Forum) / Mic-M (Github)
 * ---------------------------
 * Das Script nutzt den TR-064-Community-Adapter, der die WLAN-Verfügbarkeit von allen Geräten überwacht.
 *
 * Funktionen:
 *  - Ermittlung der anwesenden und abwesenden Personen
 *  - State 'anyonePresent': wird 'true' gesetzt, wenn 1 oder mehr Personen anwesend, und 'false', wenn keiner.
 *    Dies kann als Trigger genutzt werden, um zum Beispiel alles auszuschalten, wenn keiner mehr zu Hause.
 *  - Speichern von Kommen- und Gehen-Zeiten
 *  - Führen einer An- und Abwesenheitsliste als Json und HTML
 *  - optional: Datei-Log  für jede Aktualisierung der An- und Abwesenheit
 * ---------------------------
 * Ressourcen:
 *  - Script ist hier veröffentlicht: https://github.com/Mic-M/iobroker.presence-script-for-tr-064-community-adapter
 *  - Support ioBroker-Forum: https://forum.iobroker.net/topic/4538/anwesenheitscontrol-basierend-auf-tr64-adapter-script
 *  - Link zum TR-064-Community-Adapter: https://github.com/iobroker-community-adapters/ioBroker.tr-064-community
 * ---------------------------
 * Change log:
 * 1.0 - Mic: * Code improvements and fix
 * 0.8 - Mic: + JSON: Add css class "trRecentDate" for highlighting the date of most recent action.
 *              If state is "anwesend", CSS class will be applied to value in column "Kommt"
 *              If state is "abwesend", CSS class will be applied to value in column "Geht"
 *            + JSON: Add css class "trStatusPresent" / "trStatusLeft" to status values
 * 0.7 - Mic: Change statepath from javascript.0 to 0_userdata.0
 * 0.6 - Mic: Neuer State 'persons.xxx.offsetEntryLeave', zeigt wie lange die Person an-/abwesend war.
 *               entweder nur in Stunden gerundet (z.B. 49), oder in Stunden:Minuten (z.B. 48:36).
 *               Siehe Erweiterte Einstellungen, OFFSET_HOURS_AND_MINS, hier im Script.
 * 0.5 - Mic: State 'presentPersonsString': Alphabetische Sortierung und Trennzeichen kann in den erweiterten Einstellungen
 *               des Scripts geändert werden (PRESENT_PERSONS_DELIMITER). Außerdem kann Text vergeben werden, wenn niemand
 *               zu Hause ist (PRESENT_PERSONS_NONE_TXT).
 * 0.4 - Mic: kleine Korrekturen
 * 0.3 - Mic:
 *        - Diverse Verbesserungen: Sourcecode, Logging, States neu gegliedert,
 *          besserer Scriptstart, Bereinigung, Abfangen von Fehlern, usw.
 *        - Neue Option FIX_ERROR für FritzBox und iPhone (siehe Beschreibung in Konfiguration)
 * 0.2 - NightWatcher: optimiert, nun unlimitierte Geräte möglich, HTML String Liste für das Material Design
 * 0.1 - Looxer01: Initiale Version 
 * ---------------------------
 * Credits: Vielen dank an den ursprünglichen Autor Looxer01, der am 01.01.2017 das Script veröffentlichte.
 * Ebenso danke an NightWatcher, der eine Aktualisierung am 31.10.2018 veröffentlichte.
 ******************************************************************************/


/*******************************************************************************
 * Einstellungen
 ******************************************************************************/

// Pfad, unter dem die States (Datenpunkte) in den Objekten angelegt werden.
// Es wird die Anlage sowohl unterhalb '0_userdata.0' als auch 'javascript.x' unterstützt.
const STATE_PATH = '0_userdata.0.Anwesenheit.Status';


// Hier ist der State des TR-064-Community-Adapters, unter dem die einzelnen Geräte geführt sind
const STATEPATH_TR064_DEVICES    =    'tr-064-community.0.devices.';

//  Hier die zu überwachenden Geräte vom TR-064-Community-Adapters eintragen.
//  Es können beliebig viele Personen mit neuen Zeilen ergänzt werden.
//  Links: Gerät aus Spalte "Name" vom TR-TR-064-Community-Adapter
//  Rechts: Name des Besitzers, der angezeigt werden soll
const DEVICES = {
     'iPhoneDon': 'Donald', 
     'Xiaomi': 'Daisy', 
};

// Logging in Datei
const LOGFLAG = false;   // Logging ein- oder ausschalten
const LOGPATH_FS = "/opt/iobroker/iobroker-data/Anwesenheiten.csv";             // Pfad und Dateiname der Log-Datei


// Falls eine Anwesenheitssimulation verknüpft werden soll dann hier TRUE eintragen, sowie
// die Zeit in Sekunden nach Abwesenheit, die vergehen soll bis die Simulation aktiviert wird
const SIMULATION_ACTIVE = false;
const SIMULATION_DELAY = 600;


// Erweiterter Log im ioBroker
const LOG_INFO = true;    // Informationen loggen
const LOG_DEBUG = false;   // Erweiterter Log für Debugging

// Behebe FritzBox-Fehler (zumindest mit iOS): Wenn ein Gerät nicht mehr im WLAN ist, wird manchmal direkt 
// auf "nicht anwesend" im Adapter gesetzt, dann ca. 15 Sekunden später wieder auf "anwesend", dann ca. 5-10 Minuten
// später dauerhaft auf "nicht anwesend". Um dieses Verhalten zu umgehen, wird hier ein Delay eingebaut,
// um nach x Sekunden (FIX_ERROR_DELAY) zu prüfen, ob lt. Adapter tatsächlich abwesend.
// Siehe auch Github Issue: https://github.com/iobroker-community-adapters/ioBroker.tr-064-community/issues/55
const FIX_ERROR = true;
const FIX_ERROR_DELAY = 25;


/*******************************************************************************
 * Erweiterte Einstellungen
 ******************************************************************************/

/********
 * Option für Datenpunkt "presentPersonsString" (Zeigt die derzeit anwesenden Personen)
 ********/
// Trennzeichen für 'presentPersonsString'. Dieses wird zwischen den einzelnen anwesenden Namen gesetzt.
const PRESENT_PERSONS_DELIMITER = ', ';

// Text in für 'presentPersonsString', falls niemand anwesend.
const PRESENT_PERSONS_NONE_TXT = '';

/********
 * Option für Datenpunkt "persons.xxx.offsetEntryLeave" (zeigt , wie lange die Person an- oder abwesend war.)
 ********/
// Wenn true: Im Datenpunkt werden Stunden und Minuten angezeigt, z.B. 10:36 (bei 10 Stunden 36 Min.), oder 48:12 (bei 48 Std. 12 Min.)
// Wenn false: Es werden nur Stunden gerundet angezeigt, z.B. 11 (bei 10 Stunden 36 Minuten) oder 48 (bei 48 Std. 12 Min.)
const OFFSET_HOURS_AND_MINS = true;



/**********************************************************************************************************
 ++++++++++++++++++++++++++++ Ab hier nichts mehr ändern / Stop editing here! ++++++++++++++++++++++++++++
 *********************************************************************************************************/

/****************************************************************************************
 * Global variables and constants
 ****************************************************************************************/
// Final state path
const FINAL_STATE_LOCATION = validateStatePath(STATE_PATH, false);
const FINAL_STATE_PATH = validateStatePath(STATE_PATH, true) + '.';


/*******************************************************************************
 * Executed on every script start.
 *******************************************************************************/
init();
function init() {
 
    /**
     * First, validate some of the options
    */
    let passed = false;
    // Prüfen ob der jeweilige State im TR-064-Adapter existert    
    for (let lpDevice in DEVICES) {
        if (getObject(STATEPATH_TR064_DEVICES + lpDevice)) {
            passed = true;
            if (LOG_DEBUG) log('Prüfung erfolgreich: state [' + STATEPATH_TR064_DEVICES + lpDevice + '] existiert.')
        } else {
            passed = false;
            log('Das im Script angegebene Gerät [' + lpDevice + '] von ' + cl(DEVICES[lpDevice]) + ' existiert nicht in den TR-064-Community-Adapter-Objekten.', 'warn')
            log('Prüfe, ob Gerät [' + lpDevice + '] in den TR-064-Adapteroptionen so angelegt ist und Gerätename 1:1 übereinstimmt mit diesem Script.', 'warn')
        }
    }

    if (passed) {

        // Create states.
        createUserStates(FINAL_STATE_LOCATION, false, buildScriptStates(), function() {

            // Now, states are created.

            // Delete state, if SIMULATION_ACTIVE is false and if state exists. Just to clean up if it was true before and user changed it to false.
            if(! SIMULATION_ACTIVE) {
                if (isState(FINAL_STATE_PATH + 'presenceSimulationActive'), false) {
                    deleteState(FINAL_STATE_PATH + 'presenceSimulationActive');
                }
            }

            // Execute main() to get initial status with TR-064 adapter
            main(0);

            // Schedule for each user
            for (let lpDevice in DEVICES){
                on({id: STATEPATH_TR064_DEVICES + lpDevice, change:'ne'}, function(obj) {
                    let deviceName = obj.id.split('.').pop();
                    if (obj.state.ack) {
                        // Only continue if adapter presence state differs to the script state
                        if( obj.state.val !== (getState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[deviceName]) + '.isPresent')).val) {
                            if (LOG_DEBUG) log('Presence status of ' + cl(DEVICES[deviceName]) + ' actually changed');
                            if (FIX_ERROR && !obj.state.val) { // if fix Fritzbox error is active and if device is no longer in WiFi per Adapter
                                if (LOG_DEBUG) log('Fix Error being triggert, Person: ' + cl(DEVICES[deviceName]));
                                setTimeout(function() {
                                    if (!getState(obj.id).val) {
                                        // OK, so user is indeed no longer present
                                        if (LOG_DEBUG) log ('Getriggert: Eine Person geht (FIX_ERROR Funktion erfolgreich)');
                                        main(deviceName);
                                    }
                                }, FIX_ERROR_DELAY * 1000);
                            } else {
                                if (LOG_DEBUG) log ('Getriggert: Eine Person kommt oder geht');
                                main(deviceName);
                            }
                        }
                    }
                });
            }

        });
        
    } else {
        log('Script wird nicht weiter ausgeführt aufgrund der ausgegebenen Fehler.', 'warn');
    }
}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
function main(userKey) {

    let currentDateTime = formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
    
    let presentPersons    = '';
    let isAnyonePresent   = false;
    let jsonArr           = [];
    let HTMLString        = "<table style='width:100%'><thead><tr><th style='text-align:left;'>Name</th><th style='text-align:left;'>Status</th><th style='text-align:left;'>Kommt</th><th style='text-align:left;'>Geht</th></tr></thead><tbody>";
    let counter = 0;
    let message = '';
    for (let lpDevice in DEVICES) {
        if (LOG_DEBUG) log('Loop: Device ' + lpDevice);
        
        // Anwesenheitsstatus auslesen aus TR064
        let isLoopUserPresent = getState(STATEPATH_TR064_DEVICES + lpDevice).val;
        // Status setzen
        setState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.isPresent', isLoopUserPresent);

        // Get state times of last leave/entry
        let lpTimeLastLeave  = getState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave').val;
        let lpTimeLastEntry = getState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry').val;
        
        if (lpDevice === userKey) {
            setState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + (isLoopUserPresent ? '.timeLastEntry': '.timeLastLeave'), currentDateTime);
            setState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeMostRecent', currentDateTime);
            if(isLoopUserPresent) {
                lpTimeLastEntry = currentDateTime;
            } else {
                lpTimeLastLeave = currentDateTime;
            }
            if (LOGFLAG) writelog(cl(DEVICES[lpDevice]) + ";" + lpDevice + ";" + (isLoopUserPresent ? "Kommt": "Geht"));
            message = cl(DEVICES[lpDevice]) + (isLoopUserPresent ? ' kommt':' geht');
        }

        // Set statuses
        if (!isLoopUserPresent && !isAnyonePresent) {
            isAnyonePresent = false;
        }
        if (isLoopUserPresent) {
            counter += 1;
            if (presentPersons === '') {
                presentPersons = cl(DEVICES[lpDevice]);
            } else {
                presentPersons += '######' + cl(DEVICES[lpDevice]);
            }
            isAnyonePresent = true;
        }


        /**
         * Calculate offset leave/entry and set states accordingly
         */
        let lpCurrentOffset = '';
        let stateLeave = FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave';
        let stateEntry = FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry';
        if ( (!isEmpty(getState(stateLeave).val) && isLoopUserPresent) || (!isEmpty(getState(stateEntry).val) &&  !isLoopUserPresent ) ) {

            // As the states are string format, we simply get the last change of the state, which is a date/time variable
            let dtLeave = getState(stateLeave).lc; // '.lc' property gets us the date/time when the state changed last time
            let dtEntry = getState(stateEntry).lc;
            let offsetMs = Math.abs(dtLeave - dtEntry); // remove minus '-', so get absolute number
            let intHoursFull = offsetMs / 1000 / 60 /60; // convert milliseconds into hours
            let intHoursDecimal =  parseInt(intHoursFull.toString().substring(0, intHoursFull.toString().indexOf("."))); // not rounded
            let offsetJustMins = Math.round ( (intHoursFull - Math.round(intHoursDecimal)) * 60); // gets us just the minutes, without the hours
            let resultStrHoursOnly = Math.round(intHoursFull).toString();
            let resultStrHoursSec = zeroPad(intHoursDecimal, 2) + ':' + zeroPad(offsetJustMins, 2)
            if(LOG_DEBUG) log (cl(DEVICES[lpDevice]) + ' Offset hours only: ' + resultStrHoursOnly + ', Offset hours:seconds: ' + resultStrHoursSec);
            let finalOffsetStr = (OFFSET_HOURS_AND_MINS) ? resultStrHoursSec : resultStrHoursOnly;
            setState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', finalOffsetStr);
            lpCurrentOffset = finalOffsetStr;

        } else {
            // nothing to calculate, so empty state
            setState(FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', '');
            lpCurrentOffset = '';
        }

        /**
         * Generate JSON
         */
        let lpObjJ = {};
        lpObjJ['Name']                  = cl(DEVICES[lpDevice]);
        lpObjJ['Status']                = (isLoopUserPresent ? "<span class='trStatusPresent'>anwesend</span>" : "<span class='trStatusLeave'>abwesend</span>");
        lpObjJ['Letzte Ankunft']        = ((isLoopUserPresent) ? "<span class='trRecentDate'>" : '') + lpTimeLastEntry + ((isLoopUserPresent) ? '</span>' : '');
        lpObjJ['Letzte Abwesenheit']    = ((!isLoopUserPresent) ? "<span class='trRecentDate'>" : '') + lpTimeLastLeave + ((!isLoopUserPresent) ? '</span>' : '');
        lpObjJ['Dauer']                 = lpCurrentOffset;
        jsonArr.push(lpObjJ);

        /**
         * Generate HTML String
         */
        HTMLString+="<tr>";
        HTMLString+="<td>"+cl(DEVICES[lpDevice])+"</td>"
        HTMLString+="<td>"+(isLoopUserPresent ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>')+"</td>"
        HTMLString+="<td>"+lpTimeLastEntry+"</td>"
        HTMLString+="<td>"+lpTimeLastLeave+"</td>"
        HTMLString+="</tr>";

    } // for (let lpDevice in DEVICES) {


    // Prepare present persons string
    if (!isAnyonePresent) {
        presentPersons = PRESENT_PERSONS_NONE_TXT;
    } else {
        // sort present persons alphabetically and add delimiter from options, when converting back to string
        let presPersArr = presentPersons.split('######');
        presPersArr.sort(); 
        presentPersons = presPersArr.join(PRESENT_PERSONS_DELIMITER);
    }
    


    // Log
    if (LOG_INFO && (message != '')) {
        if (isAnyonePresent) {
            log(message + ', damit ' + (counter <= 1 ? 'ist':'sind') + ' jetzt ' + counter + (counter <= 1 ? ' Person anwesend: ':' Personen anwesend: ') + presentPersons); 
        } else {
            log(message + ', damit ist jetzt niemand mehr anwesend.'); 
        }
    }

    HTMLString += "</body></table>";  
    
    setState(FINAL_STATE_PATH + 'presentPersonsJson', JSON.stringify(jsonArr));
    setState(FINAL_STATE_PATH + 'presentPersonsHTML', HTMLString);

    setState(FINAL_STATE_PATH + 'anyonePresent', isAnyonePresent);
    setState(FINAL_STATE_PATH + 'allPresentPersonsCount', counter);
    setState(FINAL_STATE_PATH + 'presentPersonsString', presentPersons);


    // Anwesenheitssimulation ein-oder ausschalten
    if (SIMULATION_ACTIVE){
        if (isAnyonePresent) {
            setState(FINAL_STATE_PATH + 'presenceSimulationActive', false);    
        } else {
            if (! getState(FINAL_STATE_PATH + 'presenceSimulationActive').val) {
                // Presence simulation is currently off, so we set flag to true
                setStateDelayed(FINAL_STATE_PATH + 'presenceSimulationActive', true, SIMULATION_DELAY * 1000);
                if (LOG_INFO) log('Presence Simulation flag will be activated in ' + SIMULATION_DELAY + ' seconds.');     
            }
        } 
    }
   
}


/*********************************
 * Schreibt einen Logeintrag in das Filesystem
 * @param {string}   string      Logeintrag
 *********************************/
function writelog(string) {
    let fs = require('fs');
    let logdate = formatDate(new Date(),"TT.MM.JJJJ");
    let logtime = formatDate(new Date(),"SS:mm:ss");

    if (fs.existsSync(LOGPATH_FS)) {
        fs.appendFileSync(LOGPATH_FS, logdate + ";" + logtime + ";" + string + "\n");       // Füge Zeile in Datei ein
    } else {     
        if (LOG_DEBUG) log('Logfile [' + LOGPATH_FS + '] nicht vorhanden, wird daher neu angelegt.');
        let headerLine = "Datum;Uhrzeit;Name;Gerät;Kommt-Geht";
        fs.appendFileSync(LOGPATH_FS, headerLine + "\n");       // Füge Zeile in Datei ein
        fs.appendFileSync(LOGPATH_FS, logdate + ";" + logtime + ";" + string + "\n");       // Füge Zeile in Datei ein
    }
}

/**
 * Prepare states we need to create
 * @return {object} Array of all states to be created with createUserStates()
 */
function buildScriptStates() {
    let finalStates = [];
    for (const lpDevice in DEVICES) {
        finalStates.push([FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.isPresent', {name: 'Is '+ cl(DEVICES[lpDevice]) + ' currently present?', type: 'boolean', read: true, write: false, def:false }]);
        finalStates.push([FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave', {name: 'Time of last LEAVE of  ' + cl(DEVICES[lpDevice]), type: 'string', read: true, write: false, def:'' }]);
        finalStates.push([FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry', {name: 'Time of last ENTRY of ' + cl(DEVICES[lpDevice]), type: 'string', read: true, write: false, def:'' }]);
        finalStates.push([FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeMostRecent', {name: 'Time of most recent entry or leave of ' + cl(DEVICES[lpDevice]), type: 'string', read: true, write: false, def:'' }]);
        finalStates.push([FINAL_STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', {name:'Offset: Leave date/time - Entry date/time', type:'string', read:true, write:false, def:'' }]);
    }
    finalStates.push([FINAL_STATE_PATH + 'anyonePresent',          {name: 'Is any person present?', type: 'boolean', read: true, write: false, def: false }]);
    finalStates.push([FINAL_STATE_PATH + 'presentPersonsString',   {name: 'List of present persons: String', type: 'string', read: true, write: false, def: '' }]);
    finalStates.push([FINAL_STATE_PATH + 'presentPersonsJson',     {name: 'List of present persons: JSON', type: 'string', read: true, write: false, def: '' }]);
    finalStates.push([FINAL_STATE_PATH + 'presentPersonsHTML',     {name: 'List of present persons: HTML', type: 'string', read: true, write: false, def: '' }]);
    finalStates.push([FINAL_STATE_PATH + 'allPresentPersonsCount', {name:'Number of present persons', type: 'number', read: true, write: false, def: 0 }]);
    if (SIMULATION_ACTIVE) finalStates.push([FINAL_STATE_PATH + 'presenceSimulationActive', {name: 'Presense Simulation Status', type: 'boolean', read: true, write: false, def: false }]);

    return finalStates;
}


/**
 * Just keep letters, numbers, umlauts, '-' and '_'
 */
function cl(strToClean) {
    return strToClean.replace(/[^a-zA-Z0-9ß-ü-_]/g,'');
}

/**
 * Checks if a a given state or part of state is existing.
 * This is a workaround, as getObject() or getState() throw warnings in the log.
 * Set strict to true if the state shall match exactly. If it is false, it will add a wildcard * to the end.
 * See: https://forum.iobroker.net/topic/11354/
 * @param {string}    strStatePath     Input string of state, like 'javas-cript.0.switches.Osram.Bedroom'
 * @param {boolean}   [strict=true]    Optional: Default is true. If true, it will work strict, if false, it will add a wildcard * to the end of the string
 * @return {boolean}                   true if state exists, false if not
 */
function isState(strStatePath, strict) {

    if(strict === undefined) strict = true;

    let mSelector;
    if (strict) {
        mSelector = $('state[id=' + strStatePath + '$]');
    } else {
        mSelector = $('state[id=' + strStatePath + ']');
    }
    if (mSelector.length > 0) {
        return true;
    } else {
        return false;
    }
}


/**
 * Checks if Array or String is not undefined, null or empty.
 * Array or String containing just whitespaces or >'< or >"< is considered empty
 * @param inputVar - Input Array or String, Number, etc.
 * @return true if it is undefined/null/empty, false if it contains value(s)
 */
function isEmpty(inputVar) {
    if (typeof inputVar !== 'undefined' && inputVar !== null) {
        var strTemp = JSON.stringify(inputVar);
        strTemp = strTemp.replace(/\s+/g, ''); // remove all whitespaces
        strTemp = strTemp.replace(/\"+/g, "");  // remove all >"<
        strTemp = strTemp.replace(/\'+/g, "");  // remove all >'<  
        if (strTemp !== '') {
            return false;            
        } else {
            return true;
        }
    } else {
        return true;
    }
}

/**
 * Fügt Vornullen zu einer Zahl hinzu, macht also z.B. aus 7 eine "007". 
 * zeroPad(5, 4);    // wird "0005"
 * zeroPad('5', 6);  // wird "000005"
 * zeroPad(1234, 2); // wird "1234" :)
 * @param  {string|number}  num     Zahl, die Vornull(en) bekommen soll
 * @param  {number}         places  Anzahl Stellen.
 * @return {string}         Zahl mit Vornullen wie gewünscht.
 */
function zeroPad(num, places) {
    let zero = places - num.toString().length + 1;
    return Array(+(zero > 0 && zero)).join("0") + num;        


} 



/**
 * For a given state path, we extract the location '0_userdata.0' or 'javascript.0' or add '0_userdata.0', if missing.
 * @param {string}  path            Like: 'Computer.Control-PC', 'javascript.0.Computer.Control-PC', '0_userdata.0.Computer.Control-PC'
 * @param {boolean} returnFullPath  If true: full path like '0_userdata.0.Computer.Control-PC', if false: just location like '0_userdata.0' or 'javascript.0'
 * @return {string}                 Path
 */
function validateStatePath(path, returnFullPath) {
    if (path.startsWith('.')) path = path.substr(1);    // Remove first dot
    if (path.endsWith('.'))   path = path.slice(0, -1); // Remove trailing dot
    if (path.length < 1) log('Provided state path is not valid / too short.', 'error')
    let match = path.match(/^((javascript\.([1-9][0-9]|[0-9])\.)|0_userdata\.0\.)/);
    let location = (match == null) ? '0_userdata.0' : match[0].slice(0, -1); // default is '0_userdata.0'.
    if(returnFullPath) {
        return (path.indexOf(location) == 0) ? path : (location + '.' + path);
    } else {
        return location;
    }
}


/**
 * Create states under 0_userdata.0 or javascript.x
 * Current Version:     https://github.com/Mic-M/iobroker.createUserStates
 * Support:             https://forum.iobroker.net/topic/26839/
 * Autor:               Mic (ioBroker) | Mic-M (github)
 * Version:             1.1 (26 January 2020)
 * Example:             see https://github.com/Mic-M/iobroker.createUserStates#beispiel
 * -----------------------------------------------
 * PLEASE NOTE: Per https://github.com/ioBroker/ioBroker.javascript/issues/474, the used function setObject() 
 *              executes the callback PRIOR to completing the state creation. Therefore, we use a setTimeout and counter. 
 * -----------------------------------------------
 * @param {string} where          Where to create the state: '0_userdata.0' or 'javascript.x'.
 * @param {boolean} force         Force state creation (overwrite), if state is existing.
 * @param {array} statesToCreate  State(s) to create. single array or array of arrays
 * @param {object} [callback]     Optional: a callback function -- This provided function will be executed after all states are created.
 */
function createUserStates(where, force, statesToCreate, callback = undefined) {
 
    const WARN = false; // Only for 0_userdata.0: Throws warning in log, if state is already existing and force=false. Default is false, so no warning in log, if state exists.
    const LOG_DEBUG = false; // To debug this function, set to true
    // Per issue #474 (https://github.com/ioBroker/ioBroker.javascript/issues/474), the used function setObject() executes the callback 
    // before the state is actual created. Therefore, we use a setTimeout and counter as a workaround.
    const DELAY = 50; // Delay in milliseconds (ms). Increase this to 100, if it is not working.

    // Validate "where"
    if (where.endsWith('.')) where = where.slice(0, -1); // Remove trailing dot
    if ( (where.match(/^((javascript\.([1-9][0-9]|[0-9]))$|0_userdata\.0$)/) == null) ) {
        log('This script does not support to create states under [' + where + ']', 'error');
        return;
    }

    // Prepare "statesToCreate" since we also allow a single state to create
    if(!Array.isArray(statesToCreate[0])) statesToCreate = [statesToCreate]; // wrap into array, if just one array and not inside an array

    // Add "where" to STATES_TO_CREATE
    for (let i = 0; i < statesToCreate.length; i++) {
        let lpPath = statesToCreate[i][0].replace(/\.*\./g, '.'); // replace all multiple dots like '..', '...' with a single '.'
        lpPath = lpPath.replace(/^((javascript\.([1-9][0-9]|[0-9])\.)|0_userdata\.0\.)/,'') // remove any javascript.x. / 0_userdata.0. from beginning
        lpPath = where + '.' + lpPath; // add where to beginning of string
        statesToCreate[i][0] = lpPath;
    }

    if (where != '0_userdata.0') {
        // Create States under javascript.x
        let numStates = statesToCreate.length;
        statesToCreate.forEach(function(loopParam) {
            if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + loopParam[0] + ']');
            let loopInit = (loopParam[1]['def'] == undefined) ? null : loopParam[1]['def']; // mimic same behavior as createState if no init value is provided
            createState(loopParam[0], loopInit, force, loopParam[1], function() {
                numStates--;
                if (numStates === 0) {
                    if (LOG_DEBUG) log('[Debug] All states processed.');
                    if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                        if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                        return callback();
                    } else {
                        return;
                    }
                }
            });
        });
    } else {
        // Create States under 0_userdata.0
        let numStates = statesToCreate.length;
        let counter = -1;
        statesToCreate.forEach(function(loopParam) {
            counter += 1;
            if (LOG_DEBUG) log ('[Debug] Currently processing following state: [' + loopParam[0] + ']');
            if( ($(loopParam[0]).length > 0) && (existsState(loopParam[0])) ) { // Workaround due to https://github.com/ioBroker/ioBroker.javascript/issues/478
                // State is existing.
                if (WARN && !force) log('State [' + loopParam[0] + '] is already existing and will no longer be created.', 'warn');
                if (!WARN && LOG_DEBUG) log('[Debug] State [' + loopParam[0] + '] is already existing. Option force (=overwrite) is set to [' + force + '].');
                if(!force) {
                    // State exists and shall not be overwritten since force=false
                    // So, we do not proceed.
                    numStates--;
                    if (numStates === 0) {
                        if (LOG_DEBUG) log('[Debug] All states successfully processed!');
                        if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                            if (LOG_DEBUG) log('[Debug] An optional callback function was provided, which we are going to execute now.');
                            return callback();
                        }
                    } else {
                        // We need to go out and continue with next element in loop.
                        return; // https://stackoverflow.com/questions/18452920/continue-in-cursor-foreach
                    }
                } // if(!force)
            }

            // State is not existing or force = true, so we are continuing to create the state through setObject().
            let obj = {};
            obj.type = 'state';
            obj.native = {};
            obj.common = loopParam[1];
            setObject(loopParam[0], obj, function (err) {
                if (err) {
                    log('Cannot write object for state [' + loopParam[0] + ']: ' + err);
                } else {
                    if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + loopParam[0] + ']')
                    let init = null;
                    if(loopParam[1].def === undefined) {
                        if(loopParam[1].type === 'number') init = 0;
                        if(loopParam[1].type === 'boolean') init = false;
                        if(loopParam[1].type === 'string') init = '';
                    } else {
                        init = loopParam[1].def;
                    }
                    setTimeout(function() {
                        setState(loopParam[0], init, true, function() {
                            if (LOG_DEBUG) log('[Debug] setState durchgeführt: ' + loopParam[0]);
                            numStates--;
                            if (numStates === 0) {
                                if (LOG_DEBUG) log('[Debug] All states processed.');
                                if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                                    if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                                    return callback();
                                }
                            }
                        });
                    }, DELAY + (20 * counter) );
                }
            });
        });
    }
}
