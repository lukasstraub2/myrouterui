"use strict";

// TODO: jslint

const port = 80;
const base_dir = "/var/lib/myrouterui";

import * as http from "http";
import * as child_process from "child_process";
import { NftChild, child_main, isNftRequest } from "./nftchild.js";
import { assert, assertNever, immutableDate as immutDate } from "./util.js";
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * @param {string} err 
 */
function exit_error(err) {
    console.log(err);
    process.exit(1);
}

/**
 * @param {string} name 
 * @returns {string}
 */
function left_file(name) {
    return path.join(base_dir, `${name}_left`);
}

/**
 * @param {string} name 
 * @returns {string}
 */
function rearm_file(name) {
    return path.join(base_dir, `${name}_rearm`);
}

/**
 * @param {string} name 
 * @param {number} count 
 * @returns {number}
 */
function count_read(name, count) {
    let left = count;
    try {
        left = parseInt(fs.readFileSync(left_file(name), {encoding: "utf-8"}));
    } catch (e) {};

    return left;
}

/**
 * @param {string} name 
 * @returns {number}
 */
function rearm_read(name) {
    let rearm = 0;
    try {
        rearm = parseInt(fs.readFileSync(rearm_file(name), {encoding: "utf-8"}));
    } catch (e) {};

    return rearm;
}

/**
 * 
 * @param {string} name 
 * @param {number} count 
 * @param {() => Date} next_rearm 
 * @returns {number} left
 */
function count_check(name, count, next_rearm) {
    const now = immutDate(new Date());

    const left = count_read(name, count);
    const rearm = rearm_read(name);

    if (now().valueOf() < rearm && left === 0) {
        return -1;
    }

    if (now().valueOf() >= rearm) {
        fs.writeFileSync(rearm_file(name), next_rearm().valueOf().toString());
    }

    return left;
}

/**
 * @param {string} name 
 * @param {number} left 
 */
function count_update(name, left) {
    fs.writeFileSync(left_file(name), (left - 1).toString());
}

/**
 * @param {http.ServerResponse<http.IncomingMessage>} response
 */
function response_redirect(response) {
    response.writeHead(303, {"Location": "."}); 
    response.end();
}

/**
 * @param {http.ServerResponse<http.IncomingMessage>} response
 * @param {string} reason
 */
function response_blocked(response, reason) {
    response.writeHead(200, {"Content-Type": "text/html"}); 
    response.write(`
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${reason}</title>
</head>
<body>
    <p>
        ${reason}
    </p>
    <a href=".">Ok</a>
</body>
</html>
`);
    response.end();
}

/**
 * @param {NftChild} child 
 * @param {http.IncomingMessage} request 
 * @param {http.ServerResponse<http.IncomingMessage>} response 
 */
function handle_request(child, request, response) {
    assert(typeof request.url === "string");
    const url = new URL(request.url, "http://localhost/");

    switch (url.pathname) {
        case "/action":
            handle_action(child, url, response);
        break;

        case "/":
        case "/index.html":
            response.writeHead(200, {"Content-Type": "text/html"}); 
            response.write(`
<!doctype html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width"/>
    <title>usbrouter control</title>
</head>
<body>
    <a href="action?enable_reading">Override reading sites (45 minutes)</a> left: ${count_read("enable_reading", 3)} <br>
    <a href="action?override">Override (30 minutes)</a> left: ${count_read("override", 1)} <br>
    <a href="action?override5">Override (5 minutes)</a> left: ${count_read("override5", 6)} <br>
    <a href="action?lockdown">Lockdown (2 hours)</a><br>
</body>
</html>
`);
            response.end(); 
        break;

        default:
            response.writeHead(404, {"Content-Type": "text/html"});
            response.write("404 not found");
            response.end();
        break;
    }
}

/**
 * @param {() => Date} now 
 * @returns {() => Date}
 */
function rearm_tomorrow(now) {
    let tmp = now();
    tmp.setDate(now().getDate() + 1);
    tmp.setHours(2, 0, 0, 0);
    return immutDate(tmp);
}

/**
 * @param {() => Date} now 
 * @returns {() => Date}
 */
function rearm_monday(now) {
    let tmp = now();
    tmp.setDate(now().getDate() + (((1 + 7 - now().getDay()) % 7) || 7));
    tmp.setHours(2, 0, 0, 0);
    return immutDate(tmp);
}

/**
 * @param {Error | null} err 
 * @param {import("./nftchild.js").NftResponse | null} nftresponse 
 * @param {http.ServerResponse<http.IncomingMessage>} response 
 */
function exec_callback_nocount(err, nftresponse, response) {
    assert(!err);
    assert(nftresponse);
    if (nftresponse === "success") {
        response_redirect(response);
    } else {
        response_blocked(response, "error");
    }
}

/**
 * @param {Error | null} err 
 * @param {import("./nftchild.js").NftResponse | null} nftresponse 
 * @param {http.ServerResponse<http.IncomingMessage>} response 
 * @param {import("./nftchild.js").NftRequest & ("enable_reading" | "override" | "override5")} nftrequest
 * @param {number} left
 */
function exec_callback_count(err, nftresponse, response, nftrequest, left) {
    assert(!err);
    assert(nftresponse);
    if (nftresponse === "success") {
        count_update(nftrequest, left);
        response_redirect(response);
    } else {
        response_blocked(response, "error");
    }
}

/**
 * @param {NftChild} child
 * @param {URL} url
 * @param {http.ServerResponse<http.IncomingMessage>} response
 */
function handle_action(child, url, response) {
    const query = url.search.slice(1);
    if (isNftRequest(query)) {
        const now = immutDate(new Date());

        switch (query) {
            case "enable_reading":
                var left = count_check("enable_reading", 3, rearm_tomorrow(now));
                if (left < 0) {
                    response_blocked(response, "Override blocked");
                    return;
                }
            break;

            case "override":
                var left = count_check("override", 1, rearm_monday(now));
                if (left < 0) {
                    response_blocked(response, "Override blocked");
                    return;
                }
            break;

            case "override5":
                var left = count_check("override5", 6, rearm_tomorrow(now));
                if (left < 0) {
                    response_blocked(response, "Override blocked");
                    return;
                }
            break;

            case "lockdown":
                child.execute({exec: "lockdown"}, (err, nftresponse) => {
                    exec_callback_nocount(err, nftresponse, response);
                });
                return;
            break;

            default:
                assertNever(query);
            break;
        }

        child.execute({exec: query}, (err, nftresponse) => {
            exec_callback_count(err, nftresponse, response, query, left);
        });
    } else {
        response_redirect(response);
    }
}

function main() {
    if (process.argv[2] === "--nft-child") {
        child_main();
    } else {
        const child = child_process.fork(process.argv[1], ["--nft-child"], {cwd: "/"});
        child.on("error", () => {exit_error("child fork failed")});
        child.on("exit", () => {exit_error("child exited")});
        child.on("disconnect", () => {exit_error("child closed channel")});
        child.on("spawn", () => {
            const server = http.createServer();
        
            server.listen(port);
            server.on("listening", () => {
                if (process.getuid && process.setuid && process. seteuid && process.setgid && process.setegid) {
                    if (process.getuid() === 0) {
                        process.setgid("myrouterui");
                        process.setegid("myrouterui");
                        process.setuid("myrouterui");
                        process.seteuid("myrouterui");
                    }
                } else {
                    throw new Error("setuid not available");
                }

                fs.mkdirSync(base_dir, { recursive: true, mode: 0o750});

                const nftchild = new NftChild(child);

                server.on("request", (request, response) => {
                    handle_request(nftchild, request, response);
                });
            });
        });
    }
}

main();
