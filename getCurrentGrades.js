const puppeteer = require('puppeteer');
const $ = require('cheerio');

module.exports.urlMaster={
    "sbstudents.org":{
        root:"https://students.sbschools.org/genesis",
        loginPage:"/sis/view?gohome=true",
        securityCheck:"/sis/j_security_check",
        main:"/parents"
    },
    "mcvts.net":{
        root:"https://parents.genesisedu.com/mcvts",
        loginPage:"/sis/view?gohome=true",
        securityCheck:"/sis/j_security_check",
        main:"/parents"
    },
}

module.exports.getSchoolUrl = function(schoolDomain,pageType){
    const root = module.exports.urlMaster[schoolDomain]?module.exports.urlMaster[schoolDomain]["root"]:module.exports.urlMaster["sbstudents.org"]["root"]
    if(!pageType || pageType == "root")
        return root
    const page = module.exports.urlMaster[schoolDomain]?module.exports.urlMaster[schoolDomain][pageType]:module.exports.urlMaster["sbstudents.org"][pageType]
    return root+page
}

module.exports.postFixUsername = function(username,school){
    if(username.includes('@'))
        return username
    return username+"@noEmail@"+school
}

module.exports.retriveJustUsername = function(username){
    if(!username.includes('@noEmail@'))
        return username
    return username.split("@noEmail@")[0]
}

module.exports.getIdFormUrl = function(url){
    return url.split('&').map(el=>el.split('=')).find((el)=>el[0]=="studentid")[1]
}

//This is a helper function to get the list of assignments on a page
async function scrapeAssignments(page) {
    var list = await page.evaluate(() => {
        var assignments = [];
        for (var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes) {
            if (node.classList && !node.classList.contains("listheading") && node.childNodes.length >= 11) {
                var assignData = {};
                assignData["Date"] = node.childNodes[3].innerText;
                assignData["Category"] = node.childNodes[7].innerText
                var titleArr = (""+node.childNodes[9].innerText).split("\n")
                assignData["Name"] = titleArr[0];
                if(titleArr.length>1){
                    titleArr.shift()
                    assignData["Subtitle"] = titleArr.join("\n");
                }
                if (node.childNodes[11].childNodes.length <= 3) {
                    assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g, '')
                } else {
                    assignData["Grade"] = node.childNodes[11].childNodes[2].textContent.replace(/\s/g, '')
                    assignData["Weighting"] = node.childNodes[11].childNodes[1].textContent.replace(/\s/g, '')
                }
                var commentText = node.childNodes[9].childNodes[node.childNodes[9].childNodes.length-2].innerText
                commentText = commentText.substring(commentText.indexOf("Close") + 5).trim()
                if (commentText != "")
                    assignData["Comment"] = commentText;
                assignments.push(assignData);
            }
        }
        return assignments;
    });
    return list;
}

function getPercentFromStr(percent){
    let finalPercent = percent.replace(/[^\d.%]/g, '')
    if(!finalPercent){
        switch(percent) {
          case "A+":
            finalPercent = "100%"
            break;
          case "A":
            finalPercent = "96%"
            break;
          case "A-":
            finalPercent = "92%"
            break;
          case "B+":
            finalPercent = "89%"
            break;
          case "B":
            finalPercent = "86%"
            break;
          case "B-":
            finalPercent = "82%"
            break;
          case "C+":
            finalPercent = "79%"
            break;
          case "C":
            finalPercent = "76%"
            break;
          case "C-":
            finalPercent = "72%"
            break;
          case "D+":
            finalPercent = "69%"
            break;
          case "D":
            finalPercent = "66%"
            break;
          case "F":
            finalPercent = "65%"
            break;
        } 
    }
    return finalPercent
}

module.exports.createBrowser = async function(params){
    const browser = await puppeteer.launch({
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
        ],
        ...params
    }).catch((err) => {
        console.log(err)
    });
    return browser
}

module.exports.createPage = async function(browser){
    //const page = await browser.newPage();
    const page=(await browser.pages())[0]
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
    await page.setRequestInterception(true);
    const blockedResourceTypes = ['image','media','font','texttrack','object','beacon','csp_report','imageset','stylesheet'];
    const skippedResources = ['quantserve','adzerk','doubleclick','adition','exelator','sharethrough','cdn.api.twitter','google-analytics','googletagmanager','google','fontawesome','facebook','analytics','optimizely','clicktale','mixpanel','zedo','clicksor','tiqcdn'];
    page.on('request', (req) => {
        const requestUrl = req._url.split('?')[0].split('#')[0];
        if (blockedResourceTypes.indexOf(req.resourceType()) !== -1 || skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)) {
            req.abort();
        } else {
            req.continue();
        }
    });
    return page
}

module.exports.openAndSignIntoGenesis = async function (page, emailURIencoded, passURIencoded, schoolDomain){
    const genesisHomePageURL = module.exports.getSchoolUrl(schoolDomain,"loginPage");
    await page.goto(genesisHomePageURL, { waitUntil: 'domcontentloaded' });
    const loginURL = `${module.exports.getSchoolUrl(schoolDomain,"securityCheck")}?j_username=${emailURIencoded}&j_password=${passURIencoded}`;
    await page.goto(loginURL, { waitUntil: 'domcontentloaded' });
}

module.exports.checkSignIn = async function (page, schoolDomain){
    return (page.url() != module.exports.getSchoolUrl(schoolDomain,"loginPage") && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
}

//formerly getData(email,pass)
module.exports.getCurrentGrades = async function (email, pass, schoolDomain) {
    email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
    //Set up browser
    const browser = await module.exports.createBrowser({
        //  headless: false, // launch headful mode
        //  slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
    })
    if (browser == null) {
        console.log("Chrome Crashed----------------------------------------------------------")
        return { Status: "Chrome Crashed" };
    }
    const page = await module.exports.createPage(browser)
    //Navigate to the site and sign in
    await module.exports.openAndSignIntoGenesis(page,email,pass,schoolDomain)
    //Verify Sign in was successful
    const signedIn = await module.exports.checkSignIn(page,schoolDomain)
    if (!signedIn) {
        await browser.close();
        console.log("BAD user||pass")
        return { Status: "Invalid" };
    }
    //Navigate to the Course Summary
    const courseSummaryTabURL = `${module.exports.getSchoolUrl(schoolDomain,"main")}?tab1=studentdata&tab2=gradebook&tab3=coursesummary&action=form&studentid=${module.exports.getIdFormUrl(page.url())}`;
    await page.goto(courseSummaryTabURL, { waitUntil: 'domcontentloaded' });
            //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
            //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Course Summary");
            //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })

    //Get an array of the classes the student has
    var grades = {};
    let classes;
    try {
        classes = await page.evaluate(() => (Array.from((document.getElementById("fldCourse")).childNodes, element => element.value)));
    } catch (err) {
        await browser.close();
        console.log("No AUP??? - No Courses Found")
        return { Status: "No Courses Found" };
    }

    //Loop through the classes the student has taken
    for (var indivClass of classes) {
        if (indivClass) {
            //Select the class
            await page.evaluate((classID) => changeCourse(classID), indivClass);
            let navResult = true;
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch((err) => {
                console.log(err)
                console.log("Page Timed-out (switch MP) ----------------------------------------------------------")
                navResult = false;
            });
            if (!navResult) {
                await browser.close();
                console.log("Page Timed-out received - broswer closed")
                return { Status: "Page Timed-out" }
            }
            //Get an array of Marking Periods that the class has grades for
            const markingPeriods = await page.evaluate(() => (Array.from((document.getElementById("fldSwitchMP")).childNodes, element => element.value)));
            const defaultMP = await page.evaluate(() => document.getElementById("fldSwitchMP").value);
            markingPeriods.splice(markingPeriods.indexOf(defaultMP), 1);
            //Get class name and teacher
            const ClassName = await page.evaluate((classID) => document.querySelectorAll('[value="' + classID + '"]')[0].innerText, indivClass);
            if (!grades[ClassName])
                grades[ClassName] = {}
            grades[ClassName]["teacher"] = await page.evaluate(() => {
                let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                if (list)
                    return list.innerText
                else
                    return null;
            });
            //Check if the marking period has started yet
            if (await page.evaluate(() => { return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]')) ? new Date() - new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime() > 0 : false })) {
                if (!grades[ClassName][defaultMP])
                    grades[ClassName][defaultMP] = {}
                grades[ClassName][defaultMP]["Assignments"] = await scrapeAssignments(page);
                const percent = await page.evaluate(() => document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, ''))
                grades[ClassName][defaultMP]["avg"] = getPercentFromStr(percent);
            }
            //Loop though the remaining marking periods
            for (var indivMarkingPeriod of markingPeriods) {
                if (indivMarkingPeriod) {
                    //If the teacher wasn't already added, try to add it now
                    if (!grades[ClassName]["teacher"]) {
                        grades[ClassName]["teacher"] = await page.evaluate(() => {
                            let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                            if (list)
                                return list.innerText
                            else
                                return null;
                        });
                    }
                    //Switch to the new marking period
                    await page.evaluate((indivMP) => {
                        document.getElementById("fldSwitchMP").value = indivMP;
                        displayMPs();
                        document.getElementsByTagName("BUTTON")[1].click()//"Switch Marking Period btn"
                    }, indivMarkingPeriod);
                    let navResult = true;
                    //Wait for the new marking period to load
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch((err) => {
                        console.log(err)
                        console.log("Page Timed-out (switch MP) ----------------------------------------------------------")
                        navResult = false;
                    });
                    if (!navResult) {
                        await browser.close();
                        console.log("Page Timed-out received - browser closed")
                        return { Status: "Page Timed-out" }
                    }
                    //Check if the marking period has started yet
                    if (await page.evaluate(() => { return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]')) ? new Date() - new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime() > 0 : false })) {
                        if (!grades[ClassName][indivMarkingPeriod])
                            grades[ClassName][indivMarkingPeriod] = {}
                        grades[ClassName][indivMarkingPeriod]["Assignments"] = await scrapeAssignments(page);
                        const percent = await page.evaluate(() => document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, ''))
                        grades[ClassName][indivMarkingPeriod]["avg"] = getPercentFromStr(percent);
                    }
                }
            }
        }
    }
    grades["Status"] = "Completed";
    await browser.close();
    return grades;
}