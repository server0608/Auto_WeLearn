import { generateCipherText } from './crypto';

const BASE_URL = 'https://welearn.sflep.com';

export interface LoginResult {
  ok: boolean;
  msg: string;
}

export interface Course {
  cid: string;
  name: string;
  per: string;
}

export interface CourseInfo {
  uid: string;
  classid: string;
  units: Array<{ name: string; [key: string]: unknown }>;
}

export class WeLearnClient {
  private cookies: string[] = [];

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...init?.headers,
      },
      redirect: 'follow',
    });
    return response;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const preloginRes = await this.fetch(
        `${BASE_URL}/user/prelogin.aspx?loginret=http://welearn.sflep.com/user/loginredirect.aspx`
      );

      if (!preloginRes.ok) {
        return { ok: false, msg: `网络请求失败，状态码: ${preloginRes.status}` };
      }

      const urlParts = preloginRes.url.split('%26');
      if (urlParts.length < 7) {
        return { ok: false, msg: '登录URL格式异常' };
      }

      const codeChallenge = urlParts[4].split('%3D')[1] || '';
      const state = urlParts[6].split('%3D')[1] || '';

      const rturl = `/connect/authorize/callback?client_id=welearn_web&redirect_uri=https%3A%2F%2Fwelearn.sflep.com%2Fsignin-sflep&response_type=code&scope=openid%20profile%20email%20phone%20address&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&x-client-SKU=ID_NET472&x-client-ver=6.32.1.0`;

      const [enpwd, ts] = generateCipherText(password);

      const loginRes = await this.fetch('https://sso.sflep.com/idsvr/account/login', {
        method: 'POST',
        body: new URLSearchParams({
          rturl,
          account: username,
          pwd: enpwd,
          ts,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!loginRes.ok) {
        return { ok: false, msg: `登录请求失败，状态码: ${loginRes.status}` };
      }

      const result = await loginRes.json();
      const code = result.code ?? -1;

      if (code === 1) {
        return { ok: false, msg: '帐号或密码错误' };
      }

      await this.fetch(`${BASE_URL}/user/prelogin.aspx?loginret=http://welearn.sflep.com/user/loginredirect.aspx`);

      if (code === 0) {
        return { ok: true, msg: '登录成功' };
      }

      return { ok: false, msg: '登录失败' };
    } catch (e) {
      return { ok: false, msg: `登录过程中发生错误: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async getCourses(): Promise<{ ok: boolean; courses: Course[]; msg: string }> {
    try {
      const res = await this.fetch(`${BASE_URL}/ajax/authCourse.aspx?action=gmc`, {
        headers: { Referer: `${BASE_URL}/2019/student/index.aspx` },
      });

      if (!res.ok) {
        return { ok: false, courses: [], msg: `获取课程失败，状态码: ${res.status}` };
      }

      const data = await res.json();
      if (!data.clist) {
        return { ok: false, courses: [], msg: '没有找到课程' };
      }

      return { ok: true, courses: data.clist, msg: '获取课程成功' };
    } catch (e) {
      return { ok: false, courses: [], msg: `获取课程列表失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async getCourseInfo(cid: string): Promise<{ ok: boolean; data?: CourseInfo; msg: string }> {
    try {
      const res = await this.fetch(`${BASE_URL}/student/course_info.aspx?cid=${cid}`);

      if (!res.ok) {
        return { ok: false, msg: `获取课程信息失败，状态码: ${res.status}` };
      }

      const text = await res.text();

      const uidMatch = text.match(/"uid":\s*(\d+),/);
      const classidMatch = text.match(/"classid":"(\w+)"/);

      if (!uidMatch || !classidMatch) {
        return { ok: false, msg: '无法解析课程信息' };
      }

      const uid = uidMatch[1];
      const classid = classidMatch[1];

      const unitsRes = await this.fetch(`${BASE_URL}/ajax/StudyStat.aspx?action=courseunits&cid=${cid}&uid=${uid}`, {
        headers: { Referer: `${BASE_URL}/2019/student/course_info.aspx` },
      });

      if (!unitsRes.ok) {
        return { ok: false, msg: `获取单元信息失败，状态码: ${unitsRes.status}` };
      }

      const unitsData = await unitsRes.json();
      if (!unitsData.info) {
        return { ok: false, msg: '单元信息格式错误' };
      }

      return {
        ok: true,
        data: { uid, classid, units: unitsData.info },
        msg: '获取单元信息成功',
      };
    } catch (e) {
      return { ok: false, msg: `获取课程单元失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async getScoLeaves(cid: string, uid: string, classid: string, unitIdx: number): Promise<{ ok: boolean; leaves: unknown[]; msg: string }> {
    try {
      const res = await this.fetch(`${BASE_URL}/ajax/StudyStat.aspx?action=scoLeaves&cid=${cid}&uid=${uid}&unitidx=${unitIdx}&classid=${classid}`, {
        headers: { Referer: `${BASE_URL}/2019/student/course_info.aspx?cid=${cid}` },
      });

      const data = await res.json();
      return { ok: true, leaves: data.info || [], msg: 'Success' };
    } catch (e) {
      return { ok: false, leaves: [], msg: String(e) };
    }
  }

  async submitCourseProgress(cid: string, uid: string, classid: string, scoid: string, accuracy: number): Promise<{ w1s: number; w1f: number; w2s: number; w2f: number }> {
    let w1s = 0, w1f = 0, w2s = 0, w2f = 0;
    const referer = `${BASE_URL}/Student/StudyCourse.aspx?cid=${cid}&classid=${classid}&sco=${scoid}`;

    const data = JSON.stringify({
      cmi: {
        completion_status: 'completed',
        interactions: [],
        launch_data: '',
        progress_measure: '1',
        score: { scaled: String(accuracy), raw: '100' },
        session_time: '0',
        success_status: 'unknown',
        total_time: '0',
        mode: 'normal',
      },
      adl: { data: [] },
      cci: {
        data: [],
        service: {
          dictionary: { headword: '', short_cuts: '' },
          new_words: [],
          notes: [],
          writing_marking: [],
          record: { files: [] },
          play: { offline_media_id: '9999' },
        },
        retry_count: '0',
        submit_time: '',
      },
    });

    try {
      await this.fetch(`${BASE_URL}/Ajax/SCO.aspx`, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'startsco160928',
          cid,
          scoid,
          uid,
        }),
        headers: { Referer: referer },
      });

      const setRes = await this.fetch(`${BASE_URL}/Ajax/SCO.aspx`, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'setscoinfo',
          cid,
          scoid,
          uid,
          data,
          isend: 'False',
        }),
        headers: { Referer: referer },
      });

      const setText = await setRes.text();
      if (setRes.ok && setText.includes('"ret":0')) {
        w1s = 1;
      } else {
        w1f = 1;
      }

      const saveRes = await this.fetch(`${BASE_URL}/Ajax/SCO.aspx`, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'savescoinfo160928',
          cid,
          scoid,
          uid,
          progress: '100',
          crate: String(accuracy),
          status: 'unknown',
          cstatus: 'completed',
          trycount: '0',
        }),
        headers: { Referer: referer },
      });

      const saveText = await saveRes.text();
      if (saveRes.ok && saveText.includes('"ret":0')) {
        w2s = 1;
      } else {
        w2f = 1;
      }
    } catch {
      w1f = 1;
      w2f = 1;
    }

    return { w1s, w1f, w2s, w2f };
  }

  async simulateTime(cid: string, uid: string, scoid: string, learningTime: number): Promise<boolean> {
    const commonData = { uid, cid, scoid };
    const commonHeaders = { Referer: `${BASE_URL}/student/StudyCourse.aspx` };
    const ajaxUrl = `${BASE_URL}/Ajax/SCO.aspx`;

    try {
      await this.fetch(ajaxUrl, {
        method: 'POST',
        body: new URLSearchParams({ ...commonData, action: 'startsco160928' }),
        headers: commonHeaders,
      });

      for (let current = 1; current <= learningTime; current++) {
        await sleep(1000);
        if (current % 60 === 0) {
          await this.fetch(ajaxUrl, {
            method: 'POST',
            body: new URLSearchParams({ ...commonData, action: 'keepsco_with_getticket_with_updatecmitime' }),
            headers: commonHeaders,
          });
        }
      }

      await this.fetch(ajaxUrl, {
        method: 'POST',
        body: new URLSearchParams({
          ...commonData,
          action: 'savescoinfo160928',
          progress: '100',
          crate: '0',
          status: 'unknown',
          cstatus: 'completed',
          trycount: '0',
        }),
        headers: commonHeaders,
      });

      return true;
    } catch {
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
