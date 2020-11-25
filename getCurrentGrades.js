const NFC = import("node-fetch-cookies");
const $ = require('cheerio');

module.exports.headerDefault={
    headers: { 'content-type': 'application/x-www-form-urlencoded'},
    method: 'get',
}

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
async function scrapeAssignments(html) {
    const list = []
    $(`.notecard>tbody>tr>td>div>table.list>tbody>tr:not(.listheading)[class]`,html).each(function(i,el) {
        var assignData = {};
        const tds = $("td.cellLeft",$(el).html())
        if(tds.children().length>1){
            assignData["Date"] = $(tds.get(1)).text().trim().replace(/ /g, '')
            //assignData["Date"] = node.childNodes[3].innerText;
            assignData["Category"] = $(tds.get(3)).contents().last().text().trim()
            //assignData["Category"] = node.childNodes[7].innerText.
            const titleColumn = $(tds.get(4));
            let titleStr = ""
            titleColumn.contents().filter(":not(.boxShadow)").each(function(i,el){
                titleStr += $(el).text()+"\n"
            })
            titleStr=titleStr.trim()    
            var titleArr = (""+titleStr).split("\n")
            //var titleArr = (""+node.childNodes[9].innerText).split("\n")
            assignData["Name"] = titleArr[0];
            if(titleArr.length>1){
                titleArr.shift()
                assignData["Subtitle"] = titleArr.join("\n");
            }
            //if (node.childNodes[11].childNodes.length <= 3) {
            const gradeColumn = $(tds.get(5))
            if (gradeColumn.contents().length <= 3) {
                assignData["Grade"] = $(gradeColumn.contents().get(0)).text().replace(/\s/g, '')
                //assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g, '')
            } else {
                console.log("Weighting")
                assignData["Grade"] = $(gradeColumn.contents().get(2)).text().replace(/\s/g, '')
                assignData["Weighting"] = $(gradeColumn.contents().get(1)).text().replace(/\s/g, '')
                console.log(assignData["Weighting"])
                //assignData["Grade"] = node.childNodes[11].childNodes[2].textContent.replace(/\s/g, '')
                //assignData["Weighting"] = node.childNodes[11].childNodes[1].textContent.replace(/\s/g, '')
            }
            var commentText = $(titleColumn.last()).text()
            //var commentText = node.childNodes[9].childNodes[node.childNodes[9].childNodes.length-2].innerText
            commentText = commentText.substring(commentText.indexOf("Close") + 5).trim()
            if (commentText != "")
                assignData["Comment"] = commentText;
            list[i]=assignData;
        }
    });
    return list
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

module.exports.openAndSignIntoGenesis = async function (cookieJar, emailURIencoded, passURIencoded, schoolDomain){
    const {fetch} = await NFC;
    const loginURL = `${module.exports.getSchoolUrl(schoolDomain,"securityCheck")}?j_username=${emailURIencoded}&j_password=${passURIencoded}`;
    const response = await fetch(cookieJar, loginURL, {...module.exports.headerDefault,method:"post"})
    return ({url:response.url,html:await response.text()})
}

module.exports.checkSignIn = function (resObj,schoolDomain){
    return (resObj.url != module.exports.getSchoolUrl(schoolDomain,"loginPage") && $('.sectionTitle', resObj.html).text().trim() != "Invalid user name or password.  Please try again.")
}

module.exports.openPage = async function (cookieJar, pageUrl){
    const {fetch} = await NFC;
    return await fetch(cookieJar, pageUrl, module.exports.headerDefault).then(response=>response.text())
}

//formerly getData(email,pass)
module.exports.getCurrentGrades = async function (email, pass, schoolDomain) {
    email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
    //Navigate to the site and sign in
    const {CookieJar} = await NFC;
    const cookieJar = new CookieJar();
    const signInInfo = await module.exports.openAndSignIntoGenesis(cookieJar,email,pass,schoolDomain)
    //Verify Sign in was successful
    const signedIn = await module.exports.checkSignIn(signInInfo,schoolDomain)
    if (!signedIn) {
        await browser.close();
        console.log("BAD user||pass")
        return { Status: "Invalid" };
    }
    //Navigate to the Course Summary
    const courseSummaryTabURL = `${module.exports.getSchoolUrl(schoolDomain,"main")}?tab1=studentdata&tab2=gradebook&tab3=coursesummary&action=form&studentid=${module.exports.getIdFormUrl(signInInfo.url)}`;
    const courseSummaryLandingContent = await module.exports.openPage(cookieJar,courseSummaryTabURL)
    //Get an array of the classes the student has
    var grades = {};
    const classes = []
    $("#fldCourse>option",courseSummaryLandingContent).map(function(i) {
        classes[i] = $(this).val();
    })
    if(classes.length==0){
        await browser.close();
        console.log("No AUP??? - No Courses Found")
        return { Status: "No Courses Found" };
    }

    //Loop through the classes the student has taken
    let classPromises = []
    for (let indivClass of classes) {
        classPromises.push(await new Promise(async (res)=>{
            //Select the class
            const [courseCode, courseSection]=indivClass.split(":")
            const coursePageUrl = `${courseSummaryTabURL}&action=form&courseCode=${courseCode}&courseSection=${courseSection}`
            console.log(coursePageUrl)
            let coursePageContent = await module.exports.openPage(cookieJar,coursePageUrl)
            //Get an array of Marking Periods that the class has grades for
            const markingPeriods = []
            $("#fldSwitchMP>option",coursePageContent).map(function(i) {
                markingPeriods[i] = $(this).val();
            })
            const defaultMP = $("#fldSwitchMP",coursePageContent).val();
            markingPeriods.splice(markingPeriods.indexOf(defaultMP), 1);
            //Get class name and teacher
            const className = $(`[value="${indivClass}"]`,coursePageContent).text()
            console.log("className: "+className+"done")
            if (!grades[className])
                grades[className] = {}
            if (!grades[className]["teacher"]) {
                grades[className]["teacher"] = $(`.list:first-child>tbody>tr.listheading+tr>td:nth-child(3)`,coursePageContent).text()
            }
            //Check if the marking period has started yet
            const timeStr = $(`.list:first-child>tbody>tr>td>div>span`,coursePageContent).first().text().match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))[0]
            console.log(timeStr)
            if (timeStr ? new Date().getTime() - new Date(timeStr).getTime() > 0 : false ) {
                if (!grades[className][defaultMP])
                    grades[className][defaultMP] = {}
                grades[className][defaultMP]["Assignments"] = await scrapeAssignments(coursePageContent);
                const percent = $($("div>b",coursePageContent).get(0)).text().replace(/\s+/g, '')
                grades[className][defaultMP]["avg"] = getPercentFromStr(percent)
            }
            //Loop though the remaining marking periods
            for (var indivMarkingPeriod of markingPeriods) {
                if (indivMarkingPeriod) {
                    //Switch to the new marking period
                    let coursePageContent = await module.exports.openPage(cookieJar,`${coursePageUrl}&mp=${indivMarkingPeriod}`)
                    //If the teacher wasn't already added, try to add it now
                    if (!grades[className]["teacher"]) {
                        grades[className]["teacher"] = $(`.list:first-child>tbody>tr.listheading+tr>td:nth-child(3)`,coursePageContent).text()
                    }
                    //Check if the marking period has started yet
                    const timeStr = $(`.list:first-child>tbody>tr>td>div>span`,coursePageContent).first().text().match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))[0]
                    console.log(timeStr)
                    if (timeStr ? new Date().getTime() - new Date(timeStr).getTime() > 0 : false ) {
                        if (!grades[className][indivMarkingPeriod])
                            grades[className][indivMarkingPeriod] = {}
                        grades[className][indivMarkingPeriod]["Assignments"] = await scrapeAssignments(coursePageContent);
                        const percent = $($("div>b",coursePageContent).get(0)).text().replace(/\s+/g, '')
                        grades[className][indivMarkingPeriod]["avg"] = getPercentFromStr(percent)
                    }
                }
            }
            res()
        }))
    }
    await Promise.all(classPromises)
    grades["Status"] = "Completed";
    return grades;
}