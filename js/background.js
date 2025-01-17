console.log(`UT Registration Plus background page: ${window.location.href}`);
var grades; // caching the grades database in memory for faster queries
var current_semesters = {};
var departments = [];
var should_open = false; // toggled flag for automatically opening popup on new pages when 'more info' hit

// these are the default options that the extension currently supports
const default_options = {
    loadAll: true,
    courseConflictHighlight: true,
    storeWaitlist: true,
};

onStartup();

function onStartup() {
    updateBadge(true);
    loadDataBase();
    getCurrentSemesters();
    getCurrentDepartments();
}

/* Handle messages and their commands from content and popup scripts*/
chrome.runtime.onMessage.addListener(function (request, sender, response) {
    switch (request.command) {
        case "courseStorage":
            if (request.action == "add") {
                add(request, sender, response);
            }
            if (request.action == "remove") {
                remove(request, sender, response);
            }
            break;
        case "isSingleConflict":
            isSingleConflict(request.dtarr, request.unique, response);
            break;
        case "checkConflicts":
            checkConflicts(response);
            break;
        case "updateBadge":
            updateBadge();
            break;
        case "updateStatus":
            updateStatus(response);
            break;
        case "alreadyContains":
            alreadyContains(request.unique, response);
            break;
        case "updateCourseList":
            updateTabs();
            break;
        case "gradesQuery":
            executeQuery(request.query, response);
            break;
        case "currentSemesters":
            response({ semesters: current_semesters });
            getCurrentSemesters();
            break;
        case "currentDepartments":
            response({ departments: departments });
            break;
        case "setOpen":
            should_open = true;
            chrome.tabs.create({ url: request.url });
            break;
        case "shouldOpen":
            response({ open: should_open });
            should_open = false;
            break;
        case "getOptionsValue":
            getOptionsValue(request.key, response);
            break;
        case "setOptionsValue":
            setOptionsValue(request.key, request.value, response);
            break;
        default:
            const xhr = new XMLHttpRequest();
            const method = request.method ? request.method.toUpperCase() : "GET";
            xhr.open(method, request.url, true);
            console.log(request);
            xhr.onload = () => {
                console.log(xhr.responseUrl);
                response(xhr.responseText);
            };
            xhr.onerror = () => response(xhr.statusText);
            if (method == "POST") {
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            }
            xhr.send(request.data);
            break;
    }
    return true;
});

/* Initially set the course data in storage */
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
        setDefaultOptions();
        chrome.storage.sync.get("savedCourses", function (data) {
            if (!data.savedCourses) {
                chrome.storage.sync.set({
                    savedCourses: [],
                });
            }
        });
    } else if (details.reason == "update") {
        // if there's been an update, call setDefaultOptions in case their settings have gotten wiped
        setDefaultOptions();
        console.log("updated");
    }
});

chrome.storage.onChanged.addListener(function (changes) {
    for (key in changes) {
        if (key === "savedCourses") {
            updateBadge(false, changes.savedCourses.newValue); // update the extension popup badge whenever the savedCourses have been changed
        }
    }
});

// get the value of an option if it exists
function getOptionsValue(key, sendResponse) {
    chrome.storage.sync.get("options", function (data) {
        if (!data.options) {
            setDefaultOptions();
        } else {
            sendResponse({
                value: data.options[key],
            });
        }
    });
}

// set the value of an option if it exists
function setOptionsValue(key, value, sendResponse) {
    chrome.storage.sync.get("options", function (data) {
        let new_options = data.options;
        if (!data.options) {
            // if there are no options set, set the defaults
            setDefaultOptions();
            new_options = default_options;
        }
        new_options[key] = value;
        chrome.storage.sync.set(
            {
                options: new_options,
            },
            function () {
                sendResponse({
                    value: new_options[key],
                });
            }
        );
    });
}

// set the default options if the options haven't been set before
function setDefaultOptions() {
    chrome.storage.sync.get("options", function (data) {
        if (!data.options) {
            chrome.storage.sync.set(
                {
                    options: default_options,
                },
                function () {
                    console.log("default options:", default_options);
                }
            );
        }
    });
}

async function getCurrentSemesters() {
    let webData;
    if(Object.keys(current_semesters).length > 0) {
        chrome.storage.local.set({
            semesterCache: current_semesters
        });
    }
    async function goFetch(linkend="") {
        console.log("lk " + linkend)
        return fetch("https://registrar.utexas.edu/schedules/" + linkend)
        .then((response) => {
            return response.text()
            .then((data) => {
                return data;
            }).catch((err) => {
                console.log(err);
            })
        });
    }

    await goFetch().then((data) => {webData = data});
    if(webData == null) {
        webData = ""
    }
    let arr = webData.split("\n");
    let i = 0
    for(let row=0; row<arr.length; row++) {
        let currentRow = arr[row]
        if(currentRow.startsWith('<li><a href="https://registrar.utexas.edu/schedules/') && currentRow[52] != "a") {
            let newWebData;

            // let start = currentRow.indexOf('Schedule">')+10;
            let start = Math.max(currentRow.lastIndexOf('Summer'), Math.max(currentRow.lastIndexOf('Spring'), currentRow.lastIndexOf('Fall')))
            let end = currentRow.indexOf('</a></li>');
            console.log(currentRow)
            console.log(start + "  " + end)
            let name = currentRow.substring(start,end);
            console.log("my name: " + name)

            let num = currentRow.indexOf('"https://registrar.utexas.edu/schedules/">')+53;
            let numend = currentRow.indexOf('" target');
            let short_sem_num = currentRow.substring(num,numend);
            current_semesters[name] = "code";

            await goFetch(short_sem_num).then((data) => {newWebData = data});
            arr2 = newWebData.split("\n")

            for(let row2=0; row2<arr2.length; row2++) {
                if(arr2[row2].startsWith('<div class="gobutton"><a href="')) {
                    let start2 = arr2[row2].indexOf('<div class="gobutton"><a href="')+31;
                    let end2 = arr2[row2].indexOf('" target="');
                    var scheduleLink = arr2[row2].substring(start2,end2);
                    var sem_num = scheduleLink.substring(scheduleLink.lastIndexOf("/") + 1).trim();
                    if (current_semesters[name] != sem_num) {
                        current_semesters[name] = sem_num;
                    }
                }
            }
        }
    }
}

// use the utexas review api for getting the list of departments
function getCurrentDepartments() {
    $.get("https://raw.githubusercontent.com/sghsri/UT-Registration-Plus/master/docs/departments.json", function (response) {
        if (response) {
            departments = JSON.parse(response);
        }
    });
}

// update the badge text to reflect the new changes
function updateBadge(first, new_changes) {
    if (new_changes) {
        updateBadgeText(first, new_changes);
    } else {
        chrome.storage.sync.get("savedCourses", function (data) {
            let courses = data.savedCourses;
            updateBadgeText(first, courses);
        });
    }
}

// update the badge text to show the number of courses that have been saved by the user
function updateBadgeText(first, courses) {
    let badge_text = courses.length > 0 ? `${courses.length}` : "";
    let flash_time = !first ? 200 : 0;
    chrome.browserAction.setBadgeText({
        text: badge_text,
    });
    if (!first) {
        // if isn't the first install of the extension, flash the badge to bring attention to it
        chrome.browserAction.setBadgeBackgroundColor({
            color: Colors.badge_flash,
        });
    }
    setTimeout(function () {
        chrome.browserAction.setBadgeBackgroundColor({
            color: Colors.badge_default,
        });
    }, flash_time);
}

/* Find all the conflicts in the courses and send them out/ if there is even a conflict*/
function checkConflicts(sendResponse) {
    chrome.storage.sync.get("savedCourses", function (data) {
        var conflicts = [];
        var courses = data.savedCourses;
        for (let i = 0; i < courses.length; i++) {
            for (let j = i + 1; j < courses.length; j++) {
                let course_a = courses[i];
                let course_b = courses[j];
                if (isConflict(course_a.datetimearr, course_b.datetimearr)) conflicts.push([course_a, course_b]);
            }
        }
        sendResponse({
            isConflict: conflicts.length !== 0,
            between: conflicts.length ? conflicts : undefined,
        });
    });
}

/* Find if the course at unique and with currdatearr is contained in the saved courses and if it conflicts with any other courses*/
function isSingleConflict(currdatearr, unique, sendResponse) {
    chrome.storage.sync.get("savedCourses", function (data) {
        var courses = data.savedCourses;
        var conflict_list = [];
        var conflict = false;
        var contains = false;
        for (let i = 0; i < courses.length; i++) {
            let course = courses[i];
            if (isConflict(currdatearr, course.datetimearr)) {
                conflict = true;
                conflict_list.push(course);
            }
            if (!contains && isSameCourse(course, unique)) {
                contains = true;
            }
        }
        sendResponse({
            isConflict: conflict,
            alreadyContains: contains,
            conflictList: conflict_list,
        });
    });
}

/* Check if conflict between two date-time-arrs*/
function isConflict(adtarr, bdtarr) {
    for (var i = 0; i < adtarr.length; i++) {
        var current_day = adtarr[i][0];
        var current_times = adtarr[i][1];
        for (var j = 0; j < bdtarr.length; j++) {
            var next_day = bdtarr[j][0];
            var next_times = bdtarr[j][1];
            if (next_day == current_day) {
                if (current_times[0] < next_times[1] && current_times[1] > next_times[0]) {
                    return true;
                }
            }
        }
    }
    return false;
}

/* Add the requested course to the storage*/
function add(request, sender, sendResponse) {
    chrome.storage.sync.get("savedCourses", function (data) {
        var courses = data.savedCourses;
        if (!contains(courses, request.course.unique)) {
            courses.push(request.course);
            console.log(courses);
            chrome.storage.sync.set({
                savedCourses: courses,
            });
        }
        sendResponse({
            done: "Added: (" + request.course.unique + ") " + request.course.coursename,
            label: "Remove Course -",
            value: "remove",
        });
    });
}
/* Find and Remove the requested course from the storage*/
function remove(request, sender, sendResponse) {
    chrome.storage.sync.get("savedCourses", function (data) {
        var courses = data.savedCourses;
        console.log(courses);
        var index = 0;
        while (index < courses.length && courses[index].unique != request.course.unique) {
            index++;
        }
        courses.splice(index, 1);
        chrome.storage.sync.set({
            savedCourses: courses,
        });
        sendResponse({
            done: "Removed: (" + request.course.unique + ") " + request.course.coursename,
            label: "Add Course +",
            value: "add",
        });
    });
}

/* Find if the unique is already contained within the storage*/
function alreadyContains(unique, sendResponse) {
    chrome.storage.sync.get("savedCourses", function (data) {
        var courses = data.savedCourses;
        sendResponse({
            alreadyContains: contains(courses, unique),
        });
    });
}

// find if a course with the current unique number exists in the user's saved courses
function contains(courses, unique) {
    var i = 0;
    while (i < courses.length) {
        if (isSameCourse(courses[i], unique)) {
            return true;
        }
        i++;
    }
    return false;
}

// does it have the same unique number as provided
function isSameCourse(course, unique) {
    return course.unique == unique;
}

// send a message to every tab open to updateit's course list (and thus recalculate its conflicts highlighting)
function updateTabs() {
    chrome.tabs.query({}, function (tabs) {
        for (var i = 0; i < tabs.length; i++) {
            chrome.tabs.sendMessage(tabs[i].id, {
                command: "updateCourseList",
            });
        }
    });
}

// const UPDATE_INTERVAL = 1000 * 60 * 16;
// setInterval(updateStatus, UPDATE_INTERVAL);
// // updateStatus();

// function updateStatus(sendResponse) {
//     chrome.storage.sync.get("savedCourses", function (data) {
//         var courses = data.savedCourses;
//         var no_change = true;
//         for (let i = 0; i < courses.length; i++) {
//             try {
//                 let c = courses[i];
//                 let old_status = c.status;
//                 let old_link = c.link;
//                 $.ajax({
//                     url: old_link,
//                     success: function (result) {
//                         if (result) {
//                             console.log(result);
//                             var object = $("<div/>").html(result).contents();
//                             let new_status = object.find('[data-th="Status"]').text();
//                             let register_link = object.find('td[data-th="Add"] a');
//                             if (register_link) register_link = register_link.attr("href");
//                             var haschanged = new_status == old_status && register_link == old_link;
//                             if (!haschanged) console.log(c.unique + " updated from " + old_status + " to " + new_status + " and " + old_link + " to " + register_link);
//                             no_change &= haschanged;
//                             c.registerlink = register_link;
//                             c.status = new_status;
//                         }
//                     },
//                 });
//             } catch (e) {
//                 console.log(e);
//                 console.log("Not logged into UT Coursebook. Could not update class statuses.");
//             }
//         }
//         if (!no_change) {
//             chrome.storage.sync.set({
//                 savedCourses: courses,
//             });
//             console.log("updated status");
//         }
//     });
// }

// execute a query on the grades database
function executeQuery(query, sendResponse) {
    var res = grades.exec(query)[0];
    sendResponse({
        data: res,
    });
}

/* Load the database*/
function loadDataBase() {
    sql = window.SQL;
    loadBinaryFile("grades.db", function (data) {
        var sqldb = new SQL.Database(data);
        grades = sqldb;
    });
}
/* load the database from file */
function loadBinaryFile(path, success) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.extension.getURL(path), true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
        var data = new Uint8Array(xhr.response);
        var arr = new Array();
        for (var i = 0; i != data.length; ++i) arr[i] = String.fromCharCode(data[i]);
        success(arr.join(""));
    };
    xhr.send();
}
