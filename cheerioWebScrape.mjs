import cheerio from 'cheerio';
//const fetch = require("node-fetch")
import fs from 'fs';
import {fetch, CookieJar} from "node-fetch-cookies";
(async () => {
    var cookieJar = new CookieJar();
    await fetch(cookieJar, 'https://parents.genesisedu.com/mcvts/j_security_check?j_username=[USERNAME]&j_password=[PASSWORD]',{
        headers: { 'content-type': 'application/x-www-form-urlencoded'},
        method: 'post',
    }).then(response=>console.log(response.url))
    let res = await fetch(cookieJar, 'https://parents.genesisedu.com/mcvts/parents?tab1=studentdata&tab2=gradebook&tab3=weeklysummary&studentid=[USERNAME]&action=form',{
        headers: { 'content-type': 'application/x-www-form-urlencoded'},
        method: 'post',
    }).then(response=>response.text());
    
    var $ = cheerio.load(res);
    //console.log($.html());
    fs.writeFileSync('afterSignIn.html', $.html(), {'encoding': 'utf-8'});
})()

// var request = require('request');
// var jar = request.jar();
// var request = request.defaults({
//   jar: jar,
//   followAllRedirects: true
// });
// var fs = require('fs');
// request.get({
//     url: 'https://parents.genesisedu.com/mcvts/sis/',
//     method: 'get',
//     jar: jar
// }, function(err, res, body) {
//     var cookies = jar.getCookies('https://parents.genesisedu.com/mcvts/sis');
//     console.log(cookies)
//     request.post({
//         url: 'https://parents.genesisedu.com/mcvts/j_security_check',
//         headers: { 
//             'content-type': 'application/x-www-form-urlencoded',
//             'accept': '*/*',
//         },
//         method: 'post',
//         //jar: jar,
//         body: 'j_username=[USERNAME]&j_password=[PASSWORD]'
//     }, function(err, res, body){
//         if(err) {
//             return console.error(err);
//         };
//         var $ = cheerio.load(body);
//         //console.log($.html());
//         fs.writeFileSync('afterSignIn.html', $.html(), {'encoding': 'utf-8'});
//         console.log(jar.getCookies('https://parents.genesisedu.com/mcvts/sis'))
//         // request.get({
//         //     url: 'https://parents.genesisedu.com/mcvts/parents?tab1=studentdata&tab2=gradebook&tab3=weeklysummary&studentid=[USERNAME]&action=form',
//         //     method: 'get',
//         //     jar: jar
//         // }, function(err, res, body) {
//         //     if(err) {
//         //     return console.error(err);
//         //     };

//         //     var $ = cheerio.load(body);
//         //     //console.log($.html());
//         //     fs.writeFileSync('index.html', $.html(), {'encoding': 'utf-8'});
//         // });
//     });
// });