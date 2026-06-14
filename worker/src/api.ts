import { generateCipherText } from './crypto';
import type { Chapter, Course, Unit } from './types';

const BASE_URL = 'https://welearn.sflep.com';
const SSO_URL = 'https://sso.sflep.com';

class CookieJar {
  private cookies = new Map<string, string>();

  apply(response: Response): void {
    const setCookie = response.headers.get('Set-Cookie');
    if (!setCookie) return;

    for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
      const [pair] = part.split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header(): string {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
  }
}

export class WeLearnClient {
  private jar = new CookieJar();

  async login(username: string, password: string): Promise<[boolean, string]> {
    try {
      let response = await this.fetch(`${BASE_URL}/user/prelogin.aspx?loginret=http://welearn.sflep.com/user/loginredirect.aspx`);
      if (!response.ok) return [false, `网络请求失败，状态码: ${response.status}`];

      const urlParts = response.url.split('%26');
      if (urlParts.length < 7) return [false, '登录URL格式异常'];

      const codeChallenge = urlParts[4].split('%3D')[1] || '';
      const state = urlParts[6].split('%3D')[1] || '';
      const rturl = `/connect/authorize/callback?client_id=welearn_web&redirect_uri=https%3A%2F%2Fwelearn.sflep.com%2Fsignin-sflep&response_type=code&scope=openid%20profile%20email%20phone%20address&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&x-client-SKU=ID_NET472&x-client-ver=6.32.1.0`;
      const [encryptedPassword, timestamp] = generateCipherText(password);

      response = await this.fetch(`${SSO_URL}/idsvr/account/login`, {
        method: 'POST',
        body: new URLSearchParams({ rturl, account: username, pwd: encryptedPassword, ts: timestamp }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!response.ok) return [false, `登录请求失败，状态码: ${response.status}`];

      const result = await response.json<{ code?: number }>();
      if (result.code === 1) return [false, '帐号或密码错误'];

      await this.fetch(`${BASE_URL}/user/prelogin.aspx?loginret=http://welearn.sflep.com/user/loginredirect.aspx`);
      return result.code === 0 ? [true, '登录成功'] : [false, '登录失败'];
    } catch (error) {
      return [false, `登录过程中发生错误: ${String(error)}`];
    }
  }

  async getCourses(): Promise<[boolean, Course[], string]> {
    try {
      const response = await this.fetch(`${BASE_URL}/ajax/authCourse.aspx?action=gmc`, {
        headers: { Referer: `${BASE_URL}/2019/student/index.aspx` },
      });
      if (!response.ok) return [false, [], `获取课程失败，状态码: ${response.status}`];

      const data = await response.json<{ clist?: Course[] }>();
      if (!data.clist) return [false, [], '没有找到课程'];
      return [true, data.clist, '获取课程成功'];
    } catch (error) {
      return [false, [], `获取课程列表失败: ${String(error)}`];
    }
  }

  async getCourseInfo(cid: string): Promise<[boolean, { uid: string; classid: string; units: Unit[] } | null, string]> {
    try {
      let response = await this.fetch(`${BASE_URL}/student/course_info.aspx?cid=${encodeURIComponent(cid)}`);
      if (!response.ok) return [false, null, `获取课程信息失败，状态码: ${response.status}`];

      const html = await response.text();
      const uidMatch = html.match(/"uid":\s*(\d+),/);
      const classidMatch = html.match(/"classid":"(\w+)"/);
      if (!uidMatch || !classidMatch) return [false, null, '无法解析课程信息'];

      const uid = uidMatch[1];
      const classid = classidMatch[1];
      response = await this.fetch(`${BASE_URL}/ajax/StudyStat.aspx?action=courseunits&cid=${encodeURIComponent(cid)}&uid=${encodeURIComponent(uid)}`, {
        headers: { Referer: `${BASE_URL}/2019/student/course_info.aspx` },
      });
      if (!response.ok) return [false, null, `获取单元信息失败，状态码: ${response.status}`];

      const data = await response.json<{ info?: Unit[] }>();
      if (!data.info) return [false, null, '单元信息格式错误'];
      return [true, { uid, classid, units: data.info }, '获取单元信息成功'];
    } catch (error) {
      return [false, null, `获取课程单元失败: ${String(error)}`];
    }
  }

  async getScoLeaves(cid: string, uid: string, classid: string, unitIdx: number): Promise<[boolean, Chapter[], string]> {
    try {
      const params = new URLSearchParams({ action: 'scoLeaves', cid, uid, unitidx: String(unitIdx), classid });
      const response = await this.fetch(`${BASE_URL}/ajax/StudyStat.aspx?${params.toString()}`, {
        headers: { Referer: `${BASE_URL}/2019/student/course_info.aspx?cid=${encodeURIComponent(cid)}` },
      });
      if (!response.ok) return [false, [], `获取章节失败，状态码: ${response.status}`];
      const data = await response.json<{ info?: Chapter[] }>();
      return [true, data.info ?? [], 'Success'];
    } catch (error) {
      return [false, [], String(error)];
    }
  }

  async submitCourseProgress(cid: string, uid: string, classid: string, scoid: string, accuracy: number): Promise<[number, number, number, number]> {
    const ajaxUrl = `${BASE_URL}/Ajax/SCO.aspx`;
    const referer = `${BASE_URL}/Student/StudyCourse.aspx?cid=${cid}&classid=${classid}&sco=${scoid}`;
    const payload = `{"cmi":{"completion_status":"completed","interactions":[],"launch_data":"","progress_measure":"1","score":{"scaled":"${accuracy}","raw":"100"},"session_time":"0","success_status":"unknown","total_time":"0","mode":"normal"},"adl":{"data":[]},"cci":{"data":[],"service":{"dictionary":{"headword":"","short_cuts":""},"new_words":[],"notes":[],"writing_marking":[],"record":{"files":[]},"play":{"offline_media_id":"9999"}},"retry_count":"0","submit_time":""}}[INTERACTIONINFO]`;

    try {
      await this.postForm(ajaxUrl, { action: 'startsco160928', cid, scoid, uid }, referer);
      let response = await this.postForm(ajaxUrl, { action: 'setscoinfo', cid, scoid, uid, data: payload, isend: 'False' }, referer);
      const way1Ok = response.ok && (await response.text()).includes('"ret":0');

      response = await this.postForm(ajaxUrl, {
        action: 'savescoinfo160928',
        cid,
        scoid,
        uid,
        progress: '100',
        crate: String(accuracy),
        status: 'unknown',
        cstatus: 'completed',
        trycount: '0',
      }, referer);
      const way2Ok = response.ok && (await response.text()).includes('"ret":0');

      return [way1Ok ? 1 : 0, way1Ok ? 0 : 1, way2Ok ? 1 : 0, way2Ok ? 0 : 1];
    } catch {
      return [0, 1, 0, 1];
    }
  }

  async startSco(cid: string, uid: string, scoid: string): Promise<boolean> {
    const response = await this.postForm(`${BASE_URL}/Ajax/SCO.aspx`, { uid, cid, scoid, action: 'startsco160928' }, `${BASE_URL}/student/StudyCourse.aspx`);
    return response.ok;
  }

  async keepScoTime(cid: string, uid: string, scoid: string): Promise<boolean> {
    const response = await this.postForm(`${BASE_URL}/Ajax/SCO.aspx`, { uid, cid, scoid, action: 'keepsco_with_getticket_with_updatecmitime' }, `${BASE_URL}/student/StudyCourse.aspx`);
    return response.ok;
  }

  async finishScoTime(cid: string, uid: string, scoid: string): Promise<boolean> {
    const response = await this.postForm(`${BASE_URL}/Ajax/SCO.aspx`, {
      uid,
      cid,
      scoid,
      action: 'savescoinfo160928',
      progress: '100',
      crate: '0',
      status: 'unknown',
      cstatus: 'completed',
      trycount: '0',
    }, `${BASE_URL}/student/StudyCourse.aspx`);
    return response.ok;
  }

  private async postForm(url: string, data: Record<string, string>, referer: string): Promise<Response> {
    return this.fetch(url, {
      method: 'POST',
      body: new URLSearchParams(data),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: referer },
    });
  }

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    let currentUrl = url;
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount < 8; redirectCount += 1) {
      response = await this.fetchOnce(currentUrl, init);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;

      const location = response.headers.get('Location');
      if (!location) return response;

      currentUrl = new URL(location, currentUrl).toString();
      init = { ...init, method: response.status === 303 ? 'GET' : init.method, body: response.status === 303 ? undefined : init.body };
    }

    return response ?? this.fetchOnce(currentUrl, init);
  }

  private async fetchOnce(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    const cookie = this.jar.header();
    if (cookie) headers.set('Cookie', cookie);

    const response = await fetch(url, { ...init, headers, redirect: 'manual' });
    this.jar.apply(response);
    return response;
  }
}
