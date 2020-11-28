const pRetry = require('p-retry')
const fetch = require("node-fetch")
const cheerio = require('cheerio')

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

module.exports.getIdFromHTML = function($){
    return $(`#fldStudent`).val()
}

//This is a helper function to get the list of assignments on a page
async function scrapeAssignments($) {
    const list = []
    $(`.notecard>tbody>tr>td>div>table.list>tbody>tr:not(.listheading)[class]`).each(function(i,el) {
        var assignData = {};
        const tds = $("td.cellLeft",$(el).html()) // err?
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
            assignData["Name"] = (""+titleArr[0]).replace(/\s+/g, ' ');
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
                assignData["Grade"] = $(gradeColumn.contents().get(2)).text().replace(/\s/g, '')
                assignData["Weighting"] = $(gradeColumn.contents().get(1)).text().replace(/\s/g, '')
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

module.exports.openAndSignIntoGenesis = async function (emailURIencoded, passURIencoded, schoolDomain){
    const loginURL = `${module.exports.getSchoolUrl(schoolDomain,"securityCheck")}?j_username=${emailURIencoded}&j_password=${passURIencoded}`;
    let cookieResponse
    try{
        cookieResponse = await fetch(loginURL, {method:"post"})
    }catch{
        return {signedIn:false}
    }
    const cookieJar = cookieResponse.headers.raw()['set-cookie'].map(e=>e.split(";")[0]).join("; ")
    const response = await pRetry(async ()=> fetch(loginURL, {headers: { 'content-type': 'application/x-www-form-urlencoded', cookie:cookieJar},method:"post"}), {retries: 5}) //Still don't know why this is necessary but it is
    const $ = cheerio.load(await response.text())
    const signedIn = checkSignIn(response.url, $ ,schoolDomain)
    return ({$,signedIn,cookie:cookieJar})
}

function checkSignIn (url, $ ,schoolDomain){
    return (url != module.exports.getSchoolUrl(schoolDomain,"loginPage") && $('.sectionTitle').text().trim() != "Invalid user name or password.  Please try again.")
}

module.exports.openPage = async function (cookieJar, pageUrl){
    return await pRetry(async ()=> fetch(pageUrl, {
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie:cookieJar},
        method: 'get',
    }),{retries: 5}).then(response=>response.text())
}

async function updateGradesWithMP(grades, className, indivMarkingPeriod, $){
    if (!grades[className])
        grades[className] = {}
    if (!grades[className]["teacher"]) {
        grades[className]["teacher"] = $(`.list:first-child>tbody>tr.listheading+tr>td:nth-child(3)`).text()
    }
    //Check if the marking period has started yet
    try{
        const timeStr = $(`.list:first-child>tbody>tr>td>div>span`).first().text().match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))[0]
        if (timeStr ? new Date().getTime() - new Date(timeStr).getTime() > 0 : false ) {
            if (!grades[className][indivMarkingPeriod])
                grades[className][indivMarkingPeriod] = {}
            grades[className][indivMarkingPeriod]["Assignments"] = await scrapeAssignments($);
            const percent = $($("div>b").get(0)).text().replace(/\s+/g, '')
            grades[className][indivMarkingPeriod]["avg"] = getPercentFromStr(percent)
        }
    }catch(e){
        console.log(e)
        console.log(`Class: ${className} MP: ${indivMarkingPeriod} -- MP was unscrapable`)
    }
}

//formerly getData(email,pass)
module.exports.getCurrentGrades = async function (email, pass, schoolDomain) {
    const grades = {};
    email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
    //Navigate to the site and sign in
    const signInInfo = await module.exports.openAndSignIntoGenesis(email,pass,schoolDomain)
    const cookieJar = signInInfo.cookie
    //Verify Sign in was successful
    if (!signInInfo.signedIn) {
        console.log("BAD user||pass")
        return { Status: "Invalid" };
    }
    //Navigate to the Course Summary
    const courseSummaryTabURL = `${module.exports.getSchoolUrl(schoolDomain,"main")}?tab1=studentdata&tab2=gradebook&tab3=coursesummary&action=form&studentid=${module.exports.getIdFromHTML(signInInfo.$)}`;
    const courseSummaryLandingContent = await module.exports.openPage(cookieJar,courseSummaryTabURL)
    //Get an array of the classes the student has
    const classes = []
    cheerio("#fldCourse>option",courseSummaryLandingContent).map(function(i) {
        classes[i] = cheerio(this).val();
    })
    if(classes.length==0){
        console.log("No AUP??? - No Courses Found")
        return { Status: "No Courses Found" };
    }

    //Loop through the classes the student has taken
    let classPromises = []
    for (let indivClass of classes) {
        classPromises.push((async ()=>{
            //Select the class
            const [courseCode, courseSection]=indivClass.split(":")
            const coursePageUrl = `${courseSummaryTabURL}&action=form&courseCode=${courseCode}&courseSection=${courseSection}`
            const coursePageContent = await module.exports.openPage(cookieJar,coursePageUrl)
            const $ = cheerio.load(coursePageContent)
            //Get an array of Marking Periods that the class has grades for
            const markingPeriods = []
            $("#fldSwitchMP>option").map(function(i) {
                markingPeriods[i] = $(this).val();
            })
            const defaultMP = $("#fldSwitchMP").val();
            markingPeriods.splice(markingPeriods.indexOf(defaultMP), 1);
            const className = $(`[value="${indivClass}"]`).text()
            updateGradesPromises = []
            updateGradesPromises.push(updateGradesWithMP(grades,className,defaultMP,$))
            for (var indivMarkingPeriod of markingPeriods) {
                if (indivMarkingPeriod) {
                    updateGradesPromises.push((async(indivMarkingPeriodParam)=>{
                        const newCoursePageContent = await module.exports.openPage(cookieJar,`${coursePageUrl}&mp=${indivMarkingPeriodParam}`)
                        await updateGradesWithMP(grades,className,indivMarkingPeriodParam,cheerio.load(newCoursePageContent))
                    })(indivMarkingPeriod))
                }
            }
            await Promise.all(updateGradesPromises)
        })())
    }
    await Promise.all(classPromises)
    grades["Status"] = "Completed";
    return grades;
}