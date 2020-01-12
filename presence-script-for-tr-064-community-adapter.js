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

// Hier drunter werden die States dieses Scripts angelegt.
// Wichtig: wir legen diese unterhalb 0_userdata.0 an, nicht unter javascript.0
const STATE_PATH = '0_userdata.0.Anwesenheit.Status.';

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
        createUserStates(getScriptStatesToCreate(), function() {
            // Now, states are created.

            // Delete state, if SIMULATION_ACTIVE is false and if state exists. Just to clean up if it was true before and user changed it to false.
            if(! SIMULATION_ACTIVE) {
                if (isState(STATE_PATH + 'presenceSimulationActive'), false) {
                    deleteState(STATE_PATH + 'presenceSimulationActive');
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
                        if( obj.state.val !== (getState(STATE_PATH + 'persons.' + cl(DEVICES[deviceName]) + '.isPresent')).val) {
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
    
    let presentPersons     = '';
    let isAnyonePresent  = false;
    let JsonString          = '[';
    let HTMLString          = "<table style='width:100%'><thead><tr><th style='text-align:left;'>Name</th><th style='text-align:left;'>Status</th><th style='text-align:left;'>Kommt</th><th style='text-align:left;'>Geht</th></tr></thead><tbody>";                                                      
    let counter = 0;
    let message = '';
    for (let lpDevice in DEVICES) {
        if (LOG_DEBUG) log('Loop: Device ' + lpDevice);
        
        // Anwesenheitsstatus auslesen aus TR064
        let isLoopUserPresent = getState(STATEPATH_TR064_DEVICES + lpDevice).val;
        // Status setzen
        setState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.isPresent', isLoopUserPresent);

        // Get state times of last leave/entry
        let lpTimeLastLeave  = getState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave').val;
        let lpTimeLastEntry = getState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry').val;
        
        if (lpDevice === userKey) {
            setState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + (isLoopUserPresent ? '.timeLastEntry': '.timeLastLeave'), currentDateTime);
            setState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeMostRecent', currentDateTime);
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
         * Generate Json String
         */
        JsonString += "{" + '"'  + "Name" + '":' + '"'  + cl(DEVICES[lpDevice]) + '"' + "," + '"'  + "Status" + '"' + ":" + '"'  + (isLoopUserPresent ? 'anwesend' : 'abwesend') + '"' + "," + '"'  + "Letzte Ankunft" + '"' + ":" + '"'  + lpTimeLastEntry + '"' + "," + '"'  + "Letzte Abwesenheit" + '"' + ":" + '"'  + lpTimeLastLeave + '"' + "}";

        /**
         * Generate HTML String
         */
        HTMLString+="<tr>";
        HTMLString+="<td>"+cl(DEVICES[lpDevice])+"</td>"
        HTMLString+="<td>"+(isLoopUserPresent ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>')+"</td>"
        HTMLString+="<td>"+lpTimeLastEntry+"</td>"
        HTMLString+="<td>"+lpTimeLastLeave+"</td>"
        HTMLString+="</tr>";

        /**
         * Calculate offset leave/entry
         */
        let stateLeave = STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave';
        let stateEntry = STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry';
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
            setState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', finalOffsetStr)
        } else {
            // nothing to calculate, so empty state
            setState(STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', '')
        }
    }

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




    JsonString += "]";  
    HTMLString += "</body></table>";  
    
    setState(STATE_PATH + 'presentPersonsJson', JsonString);
    setState(STATE_PATH + 'presentPersonsHTML', HTMLString);

    setState(STATE_PATH + 'anyonePresent', isAnyonePresent);
    setState(STATE_PATH + 'allPresentPersonsCount', counter);
    setState(STATE_PATH + 'presentPersonsString', presentPersons);


    // Anwesenheitssimulation ein-oder ausschalten
    if (SIMULATION_ACTIVE){
        if (isAnyonePresent) {
            setState(STATE_PATH + 'presenceSimulationActive', false);    
        } else {
            if (! getState(STATE_PATH + 'presenceSimulationActive').val) {
                // Presence simulation is currently off, so we set flag to true
                setStateDelayed(STATE_PATH + 'presenceSimulationActive', true, SIMULATION_DELAY * 1000);
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
function getScriptStatesToCreate() {

    if (! isState(STATE_PATH, false)) {
        if (LOG_INFO) log('Initiale Datenpunkte werden nun unter [' + STATE_PATH.slice(0, -1) + '] erstellt.');
    }

    let statesArray = [];
    for (let lpDevice in DEVICES) {
        statesArray.push( {'id': STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.isPresent', 'name': 'Is '+ cl(DEVICES[lpDevice]) + ' currently present?', 'read': true, 'write': false, 'type': 'boolean', 'def':false } );
        statesArray.push( {'id': STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastLeave', read: true, write: false, type: 'string', name: 'Time of last LEAVE of  ' + cl(DEVICES[lpDevice]), 'def':'' });
        statesArray.push( {'id': STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeLastEntry', read: true, write: false, type: 'string', name: 'Time of last ENTRY of ' + cl(DEVICES[lpDevice]), 'def':'' });
        statesArray.push( {'id': STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.timeMostRecent', read: true, write: false, type: 'string', name: 'Time of most recent entry or leave of ' + cl(DEVICES[lpDevice]), 'def':'' });
        statesArray.push( {'id': STATE_PATH + 'persons.' + cl(DEVICES[lpDevice]) + '.offsetEntryLeave', 'name':'Offset: Leave date/time - Entry date/time', 'type':'string', 'read':true, 'write':false, 'def':'' });
    }
    statesArray.push( {'id': STATE_PATH + 'anyonePresent', read: true, write: false, type: 'boolean', name: 'Is any person present?', def: false });
    statesArray.push( {'id': STATE_PATH + 'presentPersonsString', read: true, write: false, type: 'string', name: 'List of present persons: String', def: '' });
    statesArray.push( {'id': STATE_PATH + 'presentPersonsJson', read: true, write: false, type: 'string', name: 'List of present persons: JSON', def: '' });
    statesArray.push( {'id': STATE_PATH + 'presentPersonsHTML', read: true, write: false, type: 'string', name: 'List of present persons: HTML', def: '' });
    statesArray.push( {'id': STATE_PATH + 'allPresentPersonsCount', 'name':'Number of present persons', 'type':'number', 'read':true, 'write':false, 'def':0 });
    if (SIMULATION_ACTIVE) statesArray.push( {'id': STATE_PATH + 'presenceSimulationActive', 'name':'Presense Simulation Status', 'type':'boolean', 'read':true, 'write':false, 'def':false });

    return statesArray;

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
 * Creates states under 0_userdata.0
 * Source: https://forum.iobroker.net/topic/26839/
 * Thanks to ioBroker forum user "paul53" for the basis of creating states outside javascript.x
 * Version: 0.4
 * @param {array} statesToCreate  Object or array of object with state details. Template: {'id':'Test.123.456', 'name':'NAME', 'type':'number', 'unit':'UNIT', 'min':MIN, 'max':MAX, 'read':true, 'write':true, 'role':'ROLE', 'def':DEFAULT }
 * @param {object} [callback]  Optional: a callback function -- This provided function will be executed once all states are created.
 */
function createUserStates(statesToCreate, callback) {
 
    const WARN = false; // Throws warning in log, if state is already existing. Default is false, so no warning in log, if state exists
    const LOG_DEBUG = false // To debug this function, set to true
    const WHERE = '0_userdata.0';   // You could change the starting path accordingly. Not recommended to change, though.
 
    if(!Array.isArray(statesToCreate)) statesToCreate = [statesToCreate]; // we allow both an array of objects or a single object
 
    let numStates = statesToCreate.length;
    let counter = -1;
    statesToCreate.forEach(function(param) {
        counter += 1;
        if (LOG_DEBUG) log ('[Debug] Currently processing following state: [' + param.id + ']');
 
        let stateId = param.id;
        delete param.id; // remove it, to comply with ioBroker state syntax for setObject() and setState()
 
        stateId = (stateId.startsWith(WHERE)) ? stateId.substring(WHERE.length) : stateId; // remove WHERE from beginning of string
        stateId = (stateId.startsWith('.')) ? stateId.substring(1) : stateId; // remove first "."
 
        const FULL_STATE_ID = (WHERE.endsWith('.') ? WHERE : WHERE + '.') + stateId; // Final state
 
        if($(FULL_STATE_ID).length) {
            if (WARN) log('State [' + FULL_STATE_ID + '] is already existing and will no longer be created.', 'warn');
            if (!WARN && LOG_DEBUG) log('[Debug] State [' + FULL_STATE_ID + '] is already existing and will no longer be created.');
            numStates--;
            if (numStates === 0) {
                if (LOG_DEBUG) log('[Debug] All states successfully processed!');
                if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                    if (LOG_DEBUG) log('[Debug] An optional callback function was provided, which we are going to execute now.');
                    return callback();
                }
            } else {
                return; // https://stackoverflow.com/questions/18452920/continue-in-cursor-foreach
            }
        }
 
        // State is not existing, so we are continuing to create the state through setObject().
        let obj = {};
        obj.type = 'state';
        obj.native = {};
        obj.common = param;
        setObject(FULL_STATE_ID, obj, function (err) {
            if (err) {
                log('Cannot write object for state [' + FULL_STATE_ID + ']: ' + err);
            } else {
                if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + FULL_STATE_ID + ']')
                let init = null;
                if(param.def === undefined) {
                    if(param.type === 'number') init = 0;
                    if(param.type === 'boolean') init = false;
                    if(param.type === 'string') init = '';
                } else {
                    init = param.def;
                }
                setTimeout(function() {
                    setState(FULL_STATE_ID, init, true, function() {
                        log('setState durchgeführt: ' + FULL_STATE_ID);
                        numStates--;
                        if (numStates === 0) {
                            if (LOG_DEBUG) log('[Debug] All states processed.');
                            if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                                if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                                return callback();
                            }
                        }
                    });
                }, 50 + (20 * counter) );
            }
        });
 
    });
}

