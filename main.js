/**
 * Created on 1398/10/20 (2020/1/10).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */

'use strict'

const http = require('http')
const https = require('https')
// const util = require('util')

const PROXY_SETTINGS = 'proxy-settings'
const PROXY_PORT = 8686
const httpStatusCodes = {
	OK: 200,
	BAD_REQUEST: 400,
	INTERNAL_SERVER_ERROR: 500,
	NOT_IMPLEMENTED: 501,
	BAD_GATEWAY: 502,
	SERVICE_UNAVAILABLE: 503,
	GATEWAY_TIMEOUT: 504,
}
//const symbols = JSON.parse(fs.readFileSync('symbols.json', 'utf-8'))

// const rootCas = require('ssl-root-cas/latest').create()
//
// rootCas.addFile('SectigoRSADomainValidationSecureServerCA.crt')  // The file MUST be in PEM format!
// https.globalAgent.options.ca = rootCas
// // console.log(rootCas[rootCas.length - 1])

function onRequest(clientReq, clientRes) {
	try {
		console.log(clientReq.method, clientReq.url)
		// console.log(clientReq.headers)
		headersKeysToStartCase(clientReq.headers)
		console.log(clientReq.headers)
		
		const allowHeaders = {
			// Allow: 'OPTIONS, GET, HEAD, POST',
			'Access-Control-Allow-Origin': clientReq.headers['Origin'],
			'Access-Control-Allow-Methods': 'OPTIONS, GET, HEAD, POST',
			'Access-Control-Allow-Credentials': true,
			'Access-Control-Max-Age': 86400,
		}
		if (clientReq.headers['Access-Control-Request-Headers'])
			allowHeaders['Access-Control-Allow-Headers'] = clientReq.headers['Access-Control-Request-Headers']
		
		if (clientReq.method.toUpperCase() === 'OPTIONS') {
			if (clientRes.writableEnded) return
			clientRes.writeHead(httpStatusCodes.OK, allowHeaders)
			clientRes.end()
			return
		}
		// let body = []
		//
		// clientReq.on('data', chunk => body.push(chunk)).on('end', () => {
		// 	body = Buffer.concat(body).toString();
		// 	console.log('body:\n', body)
		// })
		const url = new URL(clientReq.url, 'http://tempHost')
		const cookiesStr = clientReq.headers['Cookie']
		
		if (cookiesStr === undefined) {
			if (clientRes.writableEnded) return
			
			clientRes.writeHead(httpStatusCodes.BAD_REQUEST, allowHeaders)
			clientRes.end(
					`<h1>No cookie set!</h1>`,
					'utf-8')
			return
		}
		
		const cookies = parseCookies(cookiesStr)
		//console.log(cookies)
		const proxySettings = JSON.parse(decodeURIComponent(cookies[PROXY_SETTINGS]))
		delete cookies[PROXY_SETTINGS]
		//console.log(url)
		console.log(proxySettings)
		
		if (proxySettings === null || !proxySettings.hostname) {
			if (clientRes.writableEnded) return
			
			clientRes.writeHead(httpStatusCodes.BAD_REQUEST, allowHeaders)
			clientRes.end(
					`<h1>No destination found!</h1>` +
					`<p>You should pass a <code>${PROXY_SETTINGS}</code> (JSON) variable in the URL (by GET method) and at least a <code>hostname</code> string in it.</p>`,
					'utf-8')
			return
		}
		
		const {hostname, port, protocol} = proxySettings
		// noinspection JSUnresolvedVariable
		const headerOverrides = proxySettings.headerOverrides
		headersKeysToStartCase(headerOverrides.req)
		headersKeysToStartCase(headerOverrides.res)
		
		url.hostname = hostname
		if (port !== undefined) url.port = port
		if (protocol !== undefined) url.protocol = protocol
		//console.log(url)
		
		const reqHeaders = {
			...clientReq.headers,
			'Cookie': stringifyCookies(cookies),
			...headerOverrides.req,
		}
		for (const key in reqHeaders) if (reqHeaders[key] === null) delete reqHeaders[key]
		delete reqHeaders['Host']  //  This header will be inserted automatically by the agent
		console.log(reqHeaders)
		
		const options = {
			method: clientReq.method,
			headers: reqHeaders,
			timeout: 10000,   // 15 sec less than set timeout on client side
		}
		
		const agent = url.protocol === 'https:' ? https : http
		
		const serverReq = agent.request(url, options, serverRes => {
			console.log('BACKED')
			console.log(url.href)
			console.log(serverRes.statusCode)
			console.log(serverRes.headers)
			
			const resHeaders = {
				...headersKeysToStartCase(serverRes.headers),
				...headerOverrides.res
			}
			for (const key in resHeaders.req) if (resHeaders.req[key] === null) delete resHeaders[key]
			
			clientRes.writeHead(serverRes.statusCode, {...allowHeaders, ...resHeaders})
			if (clientRes.writableEnded) return
			
			serverRes.pipe(clientRes, {
				end: true
			})
		})
		//console.log(serverReq.getHeaders())
		
		serverReq.on('error', error => {
			console.log(url.href)
			console.error(error)
			if (clientRes.writableEnded) return
			const message = error.message
			const clientResStatusCode = (() => {
				if (message.startsWith('connect ETIMEDOUT')) return httpStatusCodes.GATEWAY_TIMEOUT
				else if (message.startsWith('getaddrinfo ENOTFOUND')) return httpStatusCodes.BAD_GATEWAY
				else return httpStatusCodes.INTERNAL_SERVER_ERROR
			})()
			clientRes.writeHead(clientResStatusCode, {
				...allowHeaders,
				'Content-Type': 'text/html; charset=utf-8',
			})
			clientRes.end(
					`<h1>${error.name}</h1>` +
					`<p>${message}</p>` +
					`<p>${url}</p>` /*+
					`<pre>${error.stack}</pre>`*/,
					'utf-8')
		})
		
		clientReq.pipe(serverReq, {
			end: true
		})
	} catch (error) {
		console.error('ERROR!', clientReq.url)
		console.error(error)
		if (clientRes.writableEnded) return
		
		clientRes.writeHead(httpStatusCodes.INTERNAL_SERVER_ERROR, {
			'Content-Type': 'text/html; charset=utf-8',
		})
		clientRes.end(
				`<h1>${error.name}</h1>` +
				`<p>${error.message}</p>` +
				`<p>${clientReq.url}</p>` /*+
				`<pre>${error.stack}</pre>`*/,
				'utf-8')
	}
}

console.log(`Listening on port ${PROXY_PORT} ...`)
http.createServer(onRequest).listen(PROXY_PORT)

//**********************************************************/

function parseCookies(cookiesStr) {
	return cookiesStr.split(';').reduce((prev, current) => {
		const [name, value] = current.split('=')
		prev[name.trimLeft()] = value
		return prev
	}, {})
}

function stringifyCookies(cookiesObj) {
	return Object.entries(cookiesObj).map(cookie => cookie.join('=')).join('; ')
}

function parseSetCookies(setCookiesStr) {
	return setCookiesStr.map(setCookie => setCookie.split(';').reduce((prev, current) => {
		const [name, value] = current.split('=')
		prev[name.trimLeft()] = value === undefined ? true : value
		return prev
	}, {}))
}

function stringifySetCookies(setCookiesObj) {
	return setCookiesObj.map(setCookie => Object.entries(setCookie)[0].join('=')).join('; ')
}

//**********************************************************/

function getCookie(cookiesString, name) {
	const nameEQ = name + '='
	const cookies = cookiesString.split(';')
	for (let cookie of cookies) {
		cookie = cookie.trimLeft()
		if (cookie.indexOf(nameEQ) === 0)
			return cookie.substring(nameEQ.length, cookie.length)
	}
	return null
}

//**********************************************************/

function toStartCase(string) {
	return string.replace(/\b\w/g, v => v.toUpperCase())
}

function headersKeysToStartCase(headers) {
	for (let key in headers) {
		const newKey = toStartCase(key)
		if (key === newKey) continue
		headers[newKey] = headers[key]
		delete headers[key]
	}
	return headers
}
