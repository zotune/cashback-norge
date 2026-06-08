import { EB_PER_TRUMF_KR, FREE_CARDS, PREMIUM_CARDS, PROVIDER_NAMES, REVOLUT_SUBSCRIPTIONS, SUPPORT_LINKS } from "../shared/provider-data";
import {
  calculateCashback,
  calculateCashbackMaxKr,
  formatBreakdownWithAmounts,
  formatCompactRewardLabel,
  formatKr,
  formatRewardLabel,
  getMaxRewardPercent,
} from "../shared/reward-calculation";
import { findPriceMatches } from "../shared/price-match";
import {
  readPackageQuantityFromText,
  readPackageQuantityFromValue,
  type ProductPackageQuantity,
  type ProductPackageUnit,
} from "../shared/grocery-price-match-utils";
import {
  isEpicGamesStoreProductUrl,
  isItadGameStoreProductUrl,
  isMicrosoftStoreProductUrl,
  isSteamAppProductUrl,
} from "../shared/isthereanydeal-price-match";
import {
  findPlayStationRegionPrices,
  isPlayStationProductUrl,
  type PlayStationRegionPrice,
  type PlayStationRegionPriceResult,
} from "../shared/playstation-region-prices";
import {
  findAppStorePriceRegionPricesForUrl,
  isAppStorePriceRegionPriceUrl,
  isPotentialAppStorePriceRegionPriceUrl,
} from "../shared/appstoreprice-region-prices";
import noWords from "naughty-words/no.json";
import enWords from "naughty-words/en.json";

type UserscriptHttpRequestOptions = {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload?: (response: UserscriptHttpResponse) => void;
  onerror?: () => void;
  ontimeout?: () => void;
};

type UserscriptHttpResponse = {
  status?: number;
  response?: unknown;
  responseText?: string;
};

declare const GM_xmlhttpRequest: undefined | ((options: UserscriptHttpRequestOptions) => unknown);
declare const GM: undefined | {
  xmlHttpRequest?: (options: UserscriptHttpRequestOptions) => unknown;
};

const PROFANITY_SET = new Set([...noWords, ...enWords].map((w) => w.toLowerCase()));

const SUPABASE_URL = "https://tektckikcspxzhwjfzyn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FYwbz2OizGygwHzAJ4dbeQ_k4j6PX8s";

type DbCode = { id: number; code: string; reward: string; upvotes: number; downvotes: number };

async function fetchCodesForHost(hostname: string): Promise<DbCode[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes?hostname=eq.${encodeURIComponent(hostname)}&select=id,code,reward`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!res.ok) return [];
    const rows: Array<{ id: number; code: string; reward: string }> = await res.json();
    // Fetch vote sums
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const vRes = await fetch(
      `${SUPABASE_URL}/rest/v1/code_votes?code_id=in.(${ids.join(",")})&select=code_id,vote`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    const votes: Array<{ code_id: number; vote: number }> = vRes.ok ? await vRes.json() : [];
    return rows.map((r) => ({
      ...r,
      upvotes: votes.filter((v) => v.code_id === r.id && v.vote === 1).length,
      downvotes: votes.filter((v) => v.code_id === r.id && v.vote === -1).length,
    }));
  } catch {
    return [];
  }
}

async function apiSubmitCode(hostname: string, code: string, reward: string): Promise<{ ok: boolean; duplicate?: boolean; rate_limited?: boolean; id?: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname, code, reward }),
    });
    if (res.status === 409) return { ok: false, duplicate: true };
    if (res.status === 429) return { ok: false, rate_limited: true };
    if (!res.ok) return { ok: false };
    const data: { ok: boolean; id?: number } = await res.json();
    return { ok: true, ...(data.id !== undefined ? { id: data.id } : {}) };
  } catch {
    return { ok: false };
  }
}

async function apiVote(codeId: number, vote: 1 | -1, staticCode?: { code: string; reward: string; hostname: string }): Promise<{ upvotes: number; downvotes: number; toggled_off?: boolean; deleted?: boolean; registered_id?: number } | { rate_limited: true } | null> {  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ code_id: codeId > 0 ? codeId : undefined, vote, ...(staticCode ?? {}) }),
    });
    if (res.status === 429) return { rate_limited: true };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function apiDeleteCode(codeId: number): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ id: codeId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchOwnedCodesForHost(hostname: string): Promise<Set<number>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/owned-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) return new Set();
    const data: { ids?: number[] } = await res.json();
    return new Set(data.ids ?? []);
  } catch {
    return new Set();
  }
}



async function fetchMyVotes(hostname: string): Promise<Record<number, 1 | -1>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/my-votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) return {};
    const data: { votes?: Array<{ code_id: number; vote: number }> } = await res.json();
    const map: Record<number, 1 | -1> = {};
    for (const v of data.votes ?? []) map[v.code_id] = v.vote as 1 | -1;
    return map;
  } catch {
    return {};
  }
}

function showRateLimitFlash(near: HTMLElement): void {
  const existing = near.closest(".code-item-row")?.parentElement?.querySelector(".rate-limit-flash");
  if (existing) return;
  const flash = document.createElement("div");
  flash.className = "rate-limit-flash";
  flash.textContent = "Du har nådd grensen på 5 handlinger per dag.";
  flash.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
  near.closest(".code-item-row")?.insertAdjacentElement("afterend", flash);
  setTimeout(() => flash.remove(), 2500);
}
const CBN_LOGO_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqBQMQKDomKWayAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA1LTAzVDE2OjI3OjM3KzAwOjAwpV2gRAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNS0wM1QxNjoyNjo0MSswMDowMFLXT+UAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDUtMDNUMTY6NDA6NTgrMDA6MDC5W5FzAAAUAklEQVRo3sWaeZSeVZ3nP/dZ332pfa/sG0sWIeyJpEUgiiAIzdBo22qLOj2203NsHVpHjyAN4yiDCy5jWloElVFRtmAIxASSELJWZV8qlapUVWp7q95692e7d/4oEhIgG+f0md8573mf89z73Of7/W3P7y6CM4hS6kzNCCHetY8Qgvcibx/r5HFO12acy8P/kXImJZ1NgQDidJ1Pp92zgfF9nyAI0HUdXdcRQiClpFKpEAQBuVyOmpoawuHwOYN8V+Bvt8DpOp3OMm+/XyxWiEZDgEBKFTJNMV8IsUAplZZS5pVSe5RS2w3Dygqhkc8XiMdj5w34jNo7+Xe29pN/+VKR1as7CKSH67pzg8B/slAsTQwMjvjj2YlBx3EKlYpTzmTG/jI6OvbBtqaZlMtlxsezZxz3THhOEDsf9ziduH6AQKGUXKhp+oqeo4MLN27b25/J5b+16MqFqy6a0jI1pPHNwPWWZMcmBi3L/Gy54j7b3t50TonijO3vlUDfQ9/BfWYlWlUVxszp1H/voZTwvf+b6R+a9czqzWZow6vrp7z49LM9E3kjXyo5i//+M43zvvW1r+bQssViaTCRjN2ppOoLXI+G5ob3TOKMMfB20JkfPIq76Q30tlbE1g7EyAj20qV69oknp8du/cinjZbmaw/8nyfKMTMaalj1zEf7c/mPuX5AWzRK5Te/dUbnzrRrv3DPoaHhjIsQH6k43qN5zz0rgTPh0t61w8GDjP3sh4w+8TNK33uYzN4u/vafH+MR2Yx52WJ+9K/3I3StQcSit+V/++vHMLWXcd0vj7+8Ri8FxKzew0bX0Ig+4no02DY1lgVBYI9v2oLm+1UV19s8kSsumTdnqtGcTpwX+DNaoPvzXyTUfYTef7qXdMQiPTRK/rMftxAijhIx3TRrcPxZ9yy4ZIlz4MDVbqk0yy2XLW3GNIy2VgZ+8Tj5OYvoX7eGUa9EeyiOgWDC86g4Hu7gINJxYn6gjoxnJ67s7NyfmDVr6hjA2Ng4SilCto3reaTTqfMj0HH7Z1n54+/zvqnzaF28OKos7fLK3OnL9BdWzadxSutEsZLs6RtOBvVanNZWPfb+JfiA7/mIxgb8SBTz6quYOudCkkkDecO1VBsmthAoqfCDAL2+Fg+RrKtJ3ZROJWa2Ndd+W9NExnGcrGHovzNNY/BY31hFI0VV1Vvp+mSXeXs8GMcbh7/0DS5M1uDr+kW5rZvvi7a3fMCoq4664xMEpSKlSplwWeH6AZGP30Xq9o+hlEIAruNSKJRoue1WaqqSqGsuBSEAhQLEm7miXC7je0EkGg7dWFubRin1ueMgj/aPfiYZjx6sqk18SSnZdSatn0ziRAx079pLfNntYYrOv5az4zcHxUJUFkt4pRK+H+A4ZXzXwRECUVePkhLpeXiuR7FYplgs4zouUkpkECB9H+kHSM8n8Dyk51EqVib7lypwUo73A8nRgczs7EThRt/3ZwcyOGv+f4cLCSVQpaKtAtnkex5+xcXPF6jkC/ieh+c4+K4OLdPRGhtQUqIJweDIBE+v3IDyy7S3tXHzDTUEweTLj2tKCHDcgN88s4GmmhC9Azn+y2duOqHNIJBkxvOk4hHhBzJ5PnXYCQuoYhmt7AbS9yue7+MZOnJKO8YN16Ea6vHcCsMjGbZoUYLqmkkNArGIzcHDx3ht836mT2k4RXNv/YNp6BRLFX76qz/T3FTDcYxKKTzPp1AsU3FczfeDlOv650zgrWq0UEJNlKU0rcBadgPqk59kX7qBLV2DbHp6M12Hj5KdyOJXJli29NITL4/HbO7/yt8QBJJEPEQQyHfXlAb/8MkbufvWpdRWxwmkgjetFAQSx/WouD6+L9OuL9mxo4MFC+afOwHj2iuIF8uMtt/IK9E0m1b1cLh3Oz1HDhO4eZYvvYjWhhSWBpFI6BTtRiP2KRo/+fp4QagU2LZJQ20SqSbBHxepJL4f4Hk+nudVjY6VScWs87NA7/U3Ep45hR89+HP18oYNzL1oAR+4fC7TPjqfuTMauWThbPZt3MTB7R2YhvEOsCdXqUKIk4Cf2u/dwtL3Ja4f4PsBQSCrr1w8m46OXedH4PHnO8h7e9S+PX3yPy1fzOevX0xbay3RGdMwTQuh6WT270eODCJ0HRUEbwKdTJPyTbCaJji5xDolkwhxQvPH7wogkBIlwfMlvi/TlWLWEEL45xLMxvFO3/3pSkaNKDfN0tXFI4eozwwQueRChGbg+wG6ISiVikTr6xFCoOkajuszOJJDSkVjbQLbNskXKriejwAMQycWnXQvKg4oCaEwCBCOi/J9iEaQUiGVIpABgZTJYsUzTcv0z/QBO8UCSikOPfU8VZfMkZs//Z3Ay4/C7bdAPIGS8oQmfcelur0NXRNs6ejl4RWr2bDtMIGUXHPpdO79wnJ+8Nga1m/tAqGIhm3u+PD7uOe2K6h8/X5kdw/xhx9An9ZO4ZEf423tIPXD/0kgJy0YBIpAykSl5NgoyufiQifS6MSjv6T41e9Id2uHm9+zj66fP0bguqewl0FAqr6Ozr19/N2XH+OFtbtYMK+F6e21bNl5hN7+DJs6uimWXS6bP5WhTJ4Hf/wi+zq7CDZswln5IpWn/giBxNm0FW/3PoQmcL2AIAjwfR/f96OBVCFd1084Ws9wJ7t71p45BnTTwgyFldKE9E2D+iVXYYZtlFTs3bKNaCxKWUmMRJLv/ttL9A5kePS+u/jYjZeQLzoMjmSxTYPRsRzXL5nHj751F5//2q94Zk0HqlTEyxeRQOm3f8C+ZTlBdgJqqiEcwcuOoQA/kPheEHW9IKqkxup93+bwWCeGZvDpVb/mpW3f47pF//TuFsjls9QVPTXsV/yu5npiV1yGkgq34rD6ke/zb3fcxciOTvKuYM3G/VyzeAYf/eAiNA2S8RAXzmpmIl+mXHFY+/p+PnrPj3h29XbuvnkxM6uj+BM5goYmnK5uCk/+Dj87gapOIWwT3w8m3+UFuF4Q9n0Z7S6uYWptUyQVrrs9HW66asUNH2dY2/buLiSEYNwvo/3+Ab/TyXdF3rdQJRsaAcj09ZHbsh19/wESJQdfmGRzRVob0liWgVRvZZuRsTyViks8auG6Lp7vUSg5uJkx/HKZ8O03o104l9yKX1I5cgTqa8EwqFRcAjn5MStVXFsFItbvrp3/xOt/eGzd/m1PHhzq+vrVLUtCzZGZrNnzAGv3P/BOC7RuPchX6loIlHhw+Re+8IKmawihMXLwENZwhjY7QWt7O6mqJJGwyf7Dx8jmSpiGzshojnyxwuhYgSAI+MrnbuTZFV/imktm8vwrHRzZeRA/8DHft4DIJ/6aymgGp5iH2hqU0HBcD88PyBUqDI4PWs8f/t5/29HT9SdD126vjaWNoYnsFTsGtt0SsaJ/pQmzVjtpGnPiauIf7+Qb//shDBjzSmVfKYUMfCLpqtdiur49ads3pVua29tba8S1l83iN89t4nP3PsbcmU2s+ksnt1y/CMOYdIe1r+9jf9cxtu7soqEhTahcwFESqtJEl16F+ukvKO/eiUynkFJRLFYolyuUtW6Gsjst5QzfevGUJqbW1uL6in0DxxJdmf6fDBbGrLZE8z2hsHj8wRWf46uf/slb8wGAQ4cOEwTSbmysrxKGjlJQM2fW9uvWrvzi3ts+8ZOaKxb/e8gyL/mXf/gwZcdhzca9rHp1F9Nba5g5pZ7dB/pJxi1+98ImpFK0NKb4l/98E8lt6xiqSqDSCaivJ/TXtzL0YDdudTUVx6M/088x1uLo+2iNhJjZWEfJcVi39wAFxyFQiqNjY8naRIKqWemZhdAEcW3OqRYA8H0fKZVQSh2vFRFgzrt4AZu6Dh0q/fyXYyVDZ/rll7LioU9x6MgQjuMxpbWWupoEixdO4yPXLUKpyW9HbU2C2qoE5WlV2NdcCe1TyefyxO+4jtkLI0RnxdG8LdjxnbjmIZRyGMsKNoz3EA2bNNckmNdaTzwUZVdfhP6xcbKliRnvn7hLe9H+k3wHASklhULJk1Llj9c0hqHXPpUb0hJ1bdGJ5/5cG9uzl+BTd2P9zZ1cPLcNoU0uHQaBpL4mRUNtGpgs3mQQ4Hke1NcTpKrxvFESQQdBsBk33ku228E8avLh1gaWzbmN33ccYe3BTTQ1hUgnI/iBYmA8R2u1xoL2Jiquw2hhYsre5NqoEQ7y7yAAsHjxIjeTGe897lq6rs9YWHJSXVcujrJ1S9rv7cP9wzOsTk5l3Ipw11XT0aMRiEUm6xwpJ2drb5LyfZ9CoQL+EaqCP3Fs13rcUpl0Qw3JVBKhWVSywzA8yN8vWsi85lpWvPo82w6OEBgC2xY0puK8/4KpmLpOvuI0OqlSVSii55VSpxLIZrPk80WCIOhUyniTgDGtyrRm31c3beKGu+bGG3dsAtumo3uYvpzDLdtfQvT0YVxzBfrCBWhtLRCPIXUNT0ryRYdyoZdm9St6t/yFqsY0zfPbEXYY9BAYIcCmUqiQ6eng6rY5dFa3cejYNhqaEwQCJkoOe/uHSUZssoVyVcErNQS67HmHBVpaWshmcygl37Asc8wwtCpN0+K2bX1o8+7ulVvMUOju9y/ntgsaGd10jJqYhezswntlHerltYhkAtHchJg5HaZPpVJXx3DIpmXWHka71lJdE6KqLkx/zzj1rYJKpYLjaaRrE9iWoLrRZKxvN3csaGLfYBcFW6fiK8Ihg4GxPMmIRa5Ujo0Vx6fqlto0Mn7srWr0uHR27sUpO3vC4dBmXbeul1IidONj31y+ILehe9T8/ZbDvLh3mNGxIjcvmYt24Ty0wz34A4P4g8PIgWH8zdtxhSCjFNkLkkz5H9UUSyWaZiU42JXh9dcGWHbTXLb85QjTLmiiOg1CBdhCYooyMSvMVFNjbaZILBVhMFskFbFRMqDs+lreKU9zKdG5tQP97TFw3333kU6nvGKppFmWdZMQQtMNvcrt6Z6lfvfr9EeWLhRabT1v7D3Kgd5RehraEMuWEF+8kFBrE1rIQqFwXI+RUonQIpv6i1zChk8ibXK4q0Bvb4nRYznqG2PMvLCK3dsGGD46RjwcYFJBaQYHDg7xx71j5AKJG0hmtyaRStKfKZAMh448cserzzRe6rwziI90H8WyDFzXe8a2rXWRSGiZ73nazOU3TDn60svkH/4uH/7nL/NyQ4pZ7fUUHI8HV+1GoJje2MrFf3UxM6Ma1eUcXk8PseZOCA5hCQ9ZLjE2WiYzXMJ3fJZd10R2MMP6VV1cPL8K2gRCSTSjgO6WMFCELJ1ZbQkilkZH1xijuQptVc60R5/9ZKRndKz0DgKXXDqfw109aLqencjmHtB1fb5tm9VmNMqS+7/Ja7kCB3v6yRc0PjhtJpf17mdoSQu7RZjNAzle2tXLk+N5As9D+C532gEX6wayUsQtlhkeLtM+NY5b8di26RhVVSaptMWVl0bRZYGya4BeYjRbobk+SnVtGKfis7t7nImiSyxkopS0M8WcpZQsvevq9MjIKKVSmWuXXf3Kgf2HH6qqSn7btDDDdXVc/YPv8uILayjufAlv8BiZXzxB2A+4srmRq2bNwJ02jdH57fRh0TkwhlQZMEbwZAUnXwLp095ikU6EWb8lT6EYoiqhoJzD9X1EuJ7x4Rw7usv0xwWOqTuRqDEaC1lHZtSndkVDRqeNvn7vxr4Jo1o7/f7Axg1b0DSdbDYXmj69/f5UKv5fTcvQNF3HcVye+uNqzEMHM3U/+P5wqOKGLU2LIGVICmEJ29ZlPKZnIiGty3ZY/rdlGmdUQfYwEoUdNjFMQdHRUAgMfGzhIe0UVrKO19b3Fx/YWnyu0F69ZWpb9a5UItSVCkcH/9fXXsp//BvzCaswxb0SkTjLBsfmNzpQSpHNTkTb2pq/nkonvhQKWbamaei6TrlQGCz1Hn28/7mVK4/+8GfDbmbIVsKK26YZk4JI1nMjXdKPLL0nMu+K66o+E4hkSI4dQqgymq6h6ZMrFzJQEK4lUtfEQM8x1m3M/WTn4OwvbprS4zVPaSIaCiGUiSqZjLvDXDHtOu69+2HgLAS2b+2YXCkIAo729llz5s3+VDqV+FosFmnWdIEmNDRdl0LTuoSmvSJM4xVNaHssGASKgA8YnW+82FzY8NUV0+ryS+xEHW5+gqCcBRUgzBB2sgY7ojN09Bgdu/Jr+kbtTyhknz7msuvqm3jhx6/S29s7WZ29fdORs4jv+7z++lZ8X7J06eW88caOxalU4r/H49EbQyHb1vXJKcWba0GBECILjAohxgEXsMtlp2rjq+saRzY+ErsgvYvW1jihRBKhm/i+S3Eix9Gecae713+64Ebu9Utj3dF4nL/7+QhCaGfe8D4T+JM7v7p2E4VCiYamWvr7hqINDbUfiidin4rGwleGbCtuGPpplz6klOTzJTo69rB7/XOIofVBc+jIgKW7ftlVhVxe7XI87fe+Vr0yHZoo5frHab38Mu789utn0++5EwB47bXNKAQyCKipTnGoqzdaV1d9aSQSuiEUDl1tW9YM0zTSuq5ZQntzpU4qpJTKD4LSRK44tGd/z46ObZ3PjWx5ep0xvsPR7Gilt9Qyvqx1Z2AnGwncItMvX86H/vHx0+J4zwSOa3j16teIxaKUy2XC4TCXXbaAp5/+czydTrbalj1FN/QWXdeSCGHIICgFgRz1A3m04rhHwiHj2FO//ZNnDb5KKLcDMxLDDMUYHjjMvf/eQW3b3FPedSYc503g7QPs3HmEwWNHJvcKDAvTNLAsm3A4hB2y0DQN1/WolCs4rofjeriug6d8IkaYD3zgynMCeaYDJee0k3C+B0Hey8GRsz1z1tMq/7/lvZ6O+X97BNwJzZXdBQAAAABJRU5ErkJggg==";
type CashbackOffer = {
  provider: string;
  merchantName: string;
  domains: string[];
  reward: string;
  sourceUrl: string;
  activationUrl: string;
  terms: string;
  discountCode?: string;
  updatedAt: string;
};
type CashbackIndex = {
  version: number;
  generatedAt: string;
  offers: CashbackOffer[];
  domainIndex: Record<string, CashbackOffer[]>;
};
type CashbackFoundMessage = {
  type: "cashback-found";
  offers: CashbackOffer[];
};
type CashbackNoneMessage = {
  type: "cashback-none";
};
type GetOffersForUrlMessage = {
  type: "get-offers-for-url";
  url: string;
};
type GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product";
  url: string;
  searchTerm: string;
  price?: number;
  currency?: string;
  productUrl?: string;
  codes?: string[];
  productTitleCandidates?: string[];
  productPageClue?: boolean;
  organizationName?: string;
  productBrand?: string;
  packageAmount?: number;
  packageUnit?: ProductPackageUnit;
  volumeMl?: number;
  alcoholPercent?: number;
};
type GetPlayStationRegionPricesMessage = {
  type: "get-playstation-region-prices";
  url: string;
};
type HttpRequestMessage = {
  type: "http-request";
  url: string;
  responseType: "json" | "text";
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: RequestCredentials;
};
type OffersForUrlResponse =
  | {
      ok: true;
      offers: CashbackOffer[];
    }
  | {
      ok: false;
      reason: string;
    };
type PriceMatchOffer = {
  source?: "prisjakt" | "godpris" | "klarna" | "prisradar" | "isthereanydeal" | "ggdeals" | "allkeyshop" | "taxfree" | "vinmonopolet" | "sesum" | "enhver" | "kassal" | "finnreise" | "panflights" | "momondo" | "skyscanner" | "travellink" | "tripcom";
  sourceName?: string;
  details?: string;
  matchedCurrentMerchant?: boolean;
  matchedExactProduct?: boolean;
  shopName: string;
  price: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  productName: string;
  productUrl: string;
  offerUrl?: string;
  alternatives?: PriceMatchAlternative[];
};
type PriceMatchAlternative = {
  shopName: string;
  price: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  platform?: string;
  shippingPrice?: string;
  totalPrice?: string;
};
type FlightSearchMeta = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate?: string;
  adults: number;
  youths: number;
  children: number;
  infants: number;
};
type FinnFlightSearchData = {
  searchId: string;
  flightApiUrl: string;
  resultUrl: string;
};
type FinnFlightOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
};
type PanFlightsOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
  durationMinutes?: number;
};
type PanFlightsSearchVariant = {
  sortOrder: "duration" | "quality" | "price";
  sortRadio: "quality" | "price";
  version: number | string;
  maxStops: number;
  searchId: number;
};
type MomondoFlightSortMode = "bestflight_a" | "price_a";
type MomondoFlightSearchData = {
  formToken: string;
  resultUrl: string;
  sortMode: MomondoFlightSortMode;
};
type MomondoFlightOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
};
type SkyscannerFlightOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
};
type TravellinkFlightOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
  durationMinutes?: number;
  meRating?: number;
};
type TripComFlightOfferCandidate = PriceMatchAlternative & {
  productUrl: string;
};
type MomondoFlightLegSummary = {
  origin: string;
  destination: string;
  departureDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
  stopCount: number;
  carrierCodes: string[];
};
type TravellinkFlightLegSummary = {
  origin: string;
  destination: string;
  departureDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
  stopCount: number;
  carrierNames: string[];
};
type TravellinkLocation = {
  iata: string;
  name: string;
  geoNodeId: number;
  type: string;
};
type PriceMatchForProductResponse =
  | {
      ok: true;
      offer?: PriceMatchOffer;
      offers?: PriceMatchOffer[];
    }
  | {
      ok: false;
      reason: string;
    };
type PlayStationRegionPricesResponse =
  | {
      ok: true;
      result?: PlayStationRegionPriceResult;
    }
  | {
      ok: false;
      reason: string;
    };
type HttpRequestResponse =
  | {
      ok: true;
      responseType: "json";
      value: unknown;
    }
  | {
      ok: true;
      responseType: "text";
      text: string;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
    };
type ProductPageMeta = Omit<GetPriceMatchForProductMessage, "type">;
const HOST_ID = "cashback-varsler-notice";
const COLLAPSED_STORAGE_KEY = "cashback-varsler-collapsed";
const CHIPS_COLLAPSED_KEY = "cashback-varsler-chips-collapsed";
const CODES_COLLAPSED_KEY = "cashback-varsler-codes-collapsed";
const PRICE_MATCH_COLLAPSED_KEY = "cashback-varsler-price-match-collapsed";
const REGION_PRICES_COLLAPSED_KEY = "cashback-varsler-region-prices-collapsed";
const HIDDEN_HOSTS_KEY = "cashback-varsler-hidden-hosts";
const FLIGHT_STATIC_PRICE_SORT_AMOUNT = Number.MAX_SAFE_INTEGER;
const FINN_FLIGHT_API_FALLBACK_URL = "https://www.finn.no/travel-api/flight";
const FINN_FLIGHT_POLL_ATTEMPTS = 7;
const FINN_FLIGHT_POLL_INTERVAL_MS = 1100;
const PANFLIGHTS_FLIGHT_SEARCH_ENDPOINTS = [
  "https://workb.panflights.com/skypickersearchsingle",
  "https://worka.panflights.com/skypickersearchsingle",
  "https://panflights.com/skypickersearchsingle",
];
const PANFLIGHTS_FLIGHT_SEARCH_VARIANTS: PanFlightsSearchVariant[] = [
  { sortOrder: "duration", sortRadio: "quality", version: 0, maxStops: 6, searchId: 1000 },
  { sortOrder: "quality", sortRadio: "quality", version: 0, maxStops: 0, searchId: 1001 },
  { sortOrder: "duration", sortRadio: "quality", version: 0, maxStops: 0, searchId: 1002 },
  { sortOrder: "price", sortRadio: "quality", version: 0, maxStops: 6, searchId: 1004 },
  { sortOrder: "price", sortRadio: "quality", version: "257", maxStops: 3, searchId: 1008 },
  { sortOrder: "price", sortRadio: "quality", version: "256", maxStops: 3, searchId: 1009 },
  { sortOrder: "price", sortRadio: "quality", version: "255", maxStops: 3, searchId: 1011 },
];
const PANFLIGHTS_FLIGHT_HITS_LIMIT = 100;
const PANFLIGHTS_REASONABLE_DURATION_BUFFER_MINUTES = 240;
const PANFLIGHTS_AUTO_SEARCH_PARAM = "cbvAutoSearch";
const MOMONDO_FLIGHT_POLL_ENDPOINT = "https://www.momondo.no/i/api/search/v2/flights/poll";
const MOMONDO_FLIGHT_POLL_ATTEMPTS = 5;
const MOMONDO_FLIGHT_POLL_INTERVAL_MS = 1100;
const MOMONDO_FLIGHT_PAGE_SIZE = 50;
const MOMONDO_DEFAULT_FLIGHT_SORT_MODE: MomondoFlightSortMode = "bestflight_a";
const SKYSCANNER_FENRYR_BASE_URL = "https://www.skyscanner.net/g/fenryr/v1";
const SKYSCANNER_CLIENT_VERSION = "7.194.1";
const SKYSCANNER_CHANNEL_ID = "goandroid";
const SKYSCANNER_HTTP_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "X-Skyscanner-Authenticated": "false",
  "X-Skyscanner-ChannelId": SKYSCANNER_CHANNEL_ID,
  "X-Skyscanner-Client": "skyscanner_android_app",
  "X-Skyscanner-Client-Network-Type": "WIFI",
  "X-Skyscanner-Client-Type": "net.skyscanner.android.main",
  "X-Skyscanner-Client-Version": SKYSCANNER_CLIENT_VERSION,
  "X-Skyscanner-Currency": "NOK",
  "X-Skyscanner-Device": "Android-phone",
  "X-Skyscanner-Device-Class": "phone",
  "X-Skyscanner-Device-Model": "Pixel 8",
  "X-Skyscanner-Device-OS-Type": "Android",
  "X-Skyscanner-Device-OS-Version": "15",
  "X-Skyscanner-Locale": "nb-NO",
  "X-Skyscanner-Market": "NO",
};
const SKYSCANNER_CALENDAR_HEADERS = {
  xSkyscannerChannelId: SKYSCANNER_CHANNEL_ID,
  xSkyscannerClient: "skyscanner_android_app",
  xSkyscannerClientType: "net.skyscanner.android.main",
  xSkyscannerClientVersion: SKYSCANNER_CLIENT_VERSION,
  xSkyscannerCurrency: "NOK",
  xSkyscannerDeviceClass: "phone",
  xSkyscannerDeviceModel: "Pixel 8",
  xSkyscannerDeviceOsType: "Android",
  xSkyscannerDeviceOsVersion: "15",
  xSkyscannerDeviceType: "DEVICE_TYPE_MOBILE",
  xSkyscannerEnableGeneralSearch: false,
  xSkyscannerLocale: "nb-NO",
  xSkyscannerMarket: "NO",
};
const TRAVELLINK_BASE_URL = "https://www.travellink.no";
const TRAVELLINK_HOME_URL = `${TRAVELLINK_BASE_URL}/travel/`;
const TRAVELLINK_RECOVER_SEARCH_ENDPOINT = `${TRAVELLINK_BASE_URL}/travel/service/flow/recoverSearchRequest`;
const TRAVELLINK_GRAPHQL_ENDPOINT = `${TRAVELLINK_BASE_URL}/frontend-api/service/graphql`;
const TRAVELLINK_COMMON_HEADERS: Record<string, string> = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/json; charset=UTF-8",
};
const TRIP_COM_BASE_URL = "https://us.trip.com";
const TRIP_COM_LOW_PRICE_ENDPOINT = `${TRIP_COM_BASE_URL}/restapi/soa2/14427/GetLowPriceInCalender`;
const TRIP_COM_DEFAULT_CURRENCY = "USD";
const TRIP_COM_USD_TO_NOK_SORT_RATE = 11;
const TRIP_COM_COMMON_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Content-Type": "application/json;charset=UTF-8",
};
const TRAVELLINK_SEARCH_QUERY = `
query searchItinerary($searchItineraryRequest: SearchItineraryRequest!) {
  searchItinerary(searchItineraryRequest: $searchItineraryRequest) {
    searchId
    priceTypeDisplayed
    itineraries {
      key
      meRating
      fees { price { amount currency } type }
      legs { segmentKey segmentId }
    }
    segments {
      id
      segment { id duration carrierId sections transportTypes }
    }
    sections {
      id
      section {
        id
        departureDate
        arrivalDate
        duration
        departureId
        destinationId
        carrierId
        transportType
      }
    }
    locations { id location { id iata cityIata cityName name locationType } }
    carriers { id carrier { id name } }
  }
}
`;
const PSN_GC_DEALS_GIFT_CARD_URL = "https://gcdeals.net/no/explore?sort=relevance&category%5B0%5D=1&type%5B0%5D=1";
const PSN_GC_DEALS_GIFT_CARD_REGION_URLS: Record<string, string> = {
  AU: "https://gcdeals.net/no/group/12/playstation-network-cards-aud-australia",
  BR: "https://gcdeals.net/no/group/15/playstation-network-cards-brl-brazil",
  CA: "https://gcdeals.net/no/group/16/playstation-network-cards-cad-canada",
  CH: "https://gcdeals.net/no/group/10/playstation-network-cards-chf-switzerland",
  DE: "https://gcdeals.net/no/group/3/playstation-network-cards-eur-germany",
  DK: "https://gcdeals.net/no/group/515/playstation-network-gift-cards-dkk-denmark",
  ES: "https://gcdeals.net/no/group/11/playstation-network-cards-eur-spain",
  FI: "https://gcdeals.net/no/group/5/playstation-network-cards-eur-finland",
  FR: "https://gcdeals.net/no/group/8/playstation-network-cards-eur-france",
  GB: "https://gcdeals.net/no/group/2/playstation-network-cards-gbp-united-kingdom",
  HK: "https://gcdeals.net/no/group/22/playstation-network-cards-hkd-hong-kong",
  IN: "https://gcdeals.net/no/group/518/playstation-network-gift-cards-inr-india",
  IT: "https://gcdeals.net/no/group/6/playstation-network-cards-eur-italy",
  JP: "https://gcdeals.net/no/group/28/playstation-network-cards-jpy-japan",
  KR: "https://gcdeals.net/no/group/1021/playstation-network-gift-cards-nok-south-korea",
  MX: "https://gcdeals.net/no/group/32/playstation-network-cards-usd-mexico",
  NO: "https://gcdeals.net/no/group/9/playstation-network-cards-nok-norway",
  NZ: "https://gcdeals.net/no/group/34/playstation-network-cards-nzd-new-zealand",
  PL: "https://gcdeals.net/no/group/4/playstation-network-cards-pln-poland",
  SE: "https://gcdeals.net/no/group/522/playstation-network-gift-cards-sek-sweden",
  SG: "https://gcdeals.net/no/group/41/playstation-network-cards-sgd-singapore",
  US: "https://gcdeals.net/no/group/1/playstation-network-cards-usd-united-states",
  TR: "https://gcdeals.net/no/group/1050/playstation-network-gift-cards-try-turkey",
  UA: "https://gcdeals.net/no/group/1078/playstation-network-gift-cards-uah-ukraine",
  ZA: "https://gcdeals.net/no/group/43/playstation-network-cards-zar-south-africa",
};
const PSN_GG_DEALS_GIFT_CARD_URL = "https://gg.deals/gift-cards-group/playstation-network-card-nok-norway/";
const PSN_GG_DEALS_GIFT_CARD_REGION_URLS: Record<string, string> = {
  AU: "https://gg.deals/gift-cards-group/playstation-network-card-aud-australia/",
  BR: "https://gg.deals/gift-cards-group/playstation-network-card-brl-brazil/",
  CA: "https://gg.deals/gift-cards-group/playstation-network-card-cad-canada/",
  CH: "https://gg.deals/gift-cards-group/playstation-network-card-chf-switzerland/",
  DE: "https://gg.deals/gift-cards-group/playstation-network-card-eur-germany/",
  DK: "https://gg.deals/gift-cards-group/playstation-network-card-dkk-denmark/",
  ES: "https://gg.deals/gift-cards-group/playstation-network-card-eur-spain/",
  FI: "https://gg.deals/gift-cards-group/playstation-network-card-eur-finland/",
  FR: "https://gg.deals/gift-cards-group/playstation-network-card-eur-france/",
  GB: "https://gg.deals/gift-cards-group/playstation-network-card-gbp-united-kingdom/",
  HK: "https://gg.deals/gift-cards-group/playstation-network-card-hkd-hong-kong/",
  IN: "https://gg.deals/gift-cards-group/playstation-network-card-inr-india/",
  IT: "https://gg.deals/gift-cards-group/playstation-network-card-eur-italy/",
  JP: "https://gg.deals/gift-cards-group/playstation-network-card-jpy-japan/",
  KR: "https://gg.deals/gift-cards-group/playstation-network-card-krw-korea/",
  MX: "https://gg.deals/gift-cards-group/playstation-network-card-mxn-mexico/",
  NO: "https://gg.deals/gift-cards-group/playstation-network-card-nok-norway/",
  NZ: "https://gg.deals/gift-cards-group/playstation-network-card-nzd-new-zealand/",
  PL: "https://gg.deals/gift-cards-group/playstation-network-card-pln-poland/",
  SE: "https://gg.deals/gift-cards-group/playstation-network-card-sek-sweden/",
  SG: "https://gg.deals/gift-cards-group/playstation-network-card-sgd-singapore/",
  US: "https://gg.deals/gift-cards-group/playstation-network-card-usd-united-states/",
  TR: "https://gg.deals/gift-cards-group/playstation-network-card-try-turkey/",
  UA: "https://gg.deals/gift-cards-group/playstation-network-card-uah-ukraine/",
  ZA: "https://gg.deals/gift-cards-group/playstation-network-card-zar-south-africa/",
};
const ACTIVATED_OFFERS_STORAGE_KEY = "cashback-varsler-activated-offers";
const OFFER_ACTIVATION_TTL_MS = 2 * 60 * 60 * 1000;
const CURRENT_HOST = window.location.hostname.replace(/^www\./, "").toLowerCase();
const PRICE_MATCH_SOURCE_HOSTS = new Set([
  "prisjakt.no",
  "prisjakt.nu",
  "prisjakt.se",
  "prisjagt.dk",
  "pricespy.co.uk",
  "pricespy.co.nz",
  "hintaopas.fi",
  "ledenicheur.fr",
  "godpris.no",
  "tax-free.no",
  "klarna.com",
  "kelkoo.no",
  "prisradar.no",
  "sesum.no",
  "enhver.no",
  "kassal.app",
]);
installOfferActivationClickTracker();
chrome.runtime.onMessage.addListener((message) => {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  if (isCashbackFoundMessage(message)) {
    requestCurrentOffers();
    return;
  }
  if (isCashbackNoneMessage(message)) {
    requestCurrentOffers();
    return;
  }
  if (isRecord(message) && message.type === "toggle-notice") {
    chrome.storage.local.get(HIDDEN_HOSTS_KEY, (result: Record<string, unknown>) => {
      const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? (result[HIDDEN_HOSTS_KEY] as string[]) : [];
      const isHidden = hidden.includes(CURRENT_HOST);
      if (isHidden) {
        const next = hidden.filter((h) => h !== CURRENT_HOST);
        chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: next });
        requestCurrentOffers();
      } else {
        chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: [...hidden, CURRENT_HOST] });
        clearNotice();
      }
    });
  }
});
requestCurrentOffers();
installDynamicProductPageRefresh();
installPanFlightsAutoSearch();
function renderNoticeWithStoredState(
  offers: CashbackOffer[],
  priceMatches: PriceMatchOffer[] = [],
  regionPrices?: PlayStationRegionPriceResult,
): void {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  const isUserscript = (chrome.runtime as { id?: string }).id === undefined;
  chrome.storage.local.get([COLLAPSED_STORAGE_KEY, CHIPS_COLLAPSED_KEY, CODES_COLLAPSED_KEY, PRICE_MATCH_COLLAPSED_KEY, REGION_PRICES_COLLAPSED_KEY, HIDDEN_HOSTS_KEY], (result: Record<string, unknown>) => {
    const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? (result[HIDDEN_HOSTS_KEY] as string[]) : [];
    if (!isUserscript && hidden.includes(CURRENT_HOST)) return;
    const collapsed = result[COLLAPSED_STORAGE_KEY] === true;
    const chipsCollapsed = result[CHIPS_COLLAPSED_KEY] === true;
    const codesCollapsed = result[CODES_COLLAPSED_KEY] === true;
    const priceMatchCollapsed = result[PRICE_MATCH_COLLAPSED_KEY] === true;
    const regionPricesCollapsed = result[REGION_PRICES_COLLAPSED_KEY] === true;
    void readActivatedOffers()
      .catch(() => ({}))
      .then((activatedOffers) => {
        renderNotice(offers, collapsed, chipsCollapsed, codesCollapsed, priceMatchCollapsed, regionPricesCollapsed, activatedOffers, priceMatches, regionPrices);
      });
  });
}
function requestCurrentOffers(): void {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  void renderCurrentContext();
}

function installDynamicProductPageRefresh(): void {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined || !isDynamicPriceMatchHost(parsedUrl)) {
    return;
  }

  if (document.body === null) {
    window.addEventListener("DOMContentLoaded", installDynamicProductPageRefresh, { once: true });
    return;
  }

  let timerId: number | undefined;
  let latestMetaKey = "";
  let latestUrl = window.location.href;
  const scheduleRefresh = (): void => {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }

    timerId = window.setTimeout(() => {
      const currentUrl = parseUrl(window.location.href);
      if (currentUrl === undefined || !isDynamicPriceMatchProductPage(currentUrl)) {
        latestMetaKey = "";
        return;
      }

      const flightMeta = extractFlightSearchMeta(currentUrl);
      const productMeta = flightMeta === undefined ? extractProductPageMeta() : undefined;
      const metaKey = flightMeta !== undefined
        ? [
          buildFlightSearchMetaKey(flightMeta),
          isSkyscannerFlightSearchPage(currentUrl) ? readCurrentSkyscannerVisiblePriceKey() : "",
        ].join("|")
        : productMeta === undefined
          ? ""
          : [productMeta.searchTerm, productMeta.price, productMeta.currency, productMeta.packageAmount, productMeta.packageUnit, productMeta.volumeMl, productMeta.alcoholPercent].join("|");
      if (metaKey.length > 0 && metaKey !== latestMetaKey) {
        latestMetaKey = metaKey;
        requestCurrentOffers();
      }
    }, 250);
  };

  const scheduleLocationRefresh = (): void => {
    if (window.location.href !== latestUrl) {
      latestUrl = window.location.href;
      latestMetaKey = "";
    }
    scheduleRefresh();
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function pushState(this: History, ...args: Parameters<History["pushState"]>) {
    const result = originalPushState.apply(this, args);
    scheduleLocationRefresh();
    return result;
  };
  history.replaceState = function replaceState(this: History, ...args: Parameters<History["replaceState"]>) {
    const result = originalReplaceState.apply(this, args);
    scheduleLocationRefresh();
    return result;
  };
  window.addEventListener("popstate", scheduleLocationRefresh);
  window.addEventListener("hashchange", scheduleLocationRefresh);

  const observer = new MutationObserver((mutations) => {
    const hasExternalMutation = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return target === null || target.closest(`#${HOST_ID}`) === null;
    });
    if (hasExternalMutation) {
      scheduleRefresh();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scheduleRefresh();
}

function isNoticeBlockedHost(hostname: string): boolean {
  return false;
}

function installPanFlightsAutoSearch(): void {
  const parsedUrl = parseUrl(window.location.href);
  if (
    parsedUrl === undefined ||
    !isPanFlightsSearchPage(parsedUrl) ||
    parsedUrl.searchParams.get(PANFLIGHTS_AUTO_SEARCH_PARAM) !== "1" ||
    parsedUrl.searchParams.get("v2") === null
  ) {
    return;
  }

  let attempts = 0;
  let timerId: number | undefined;
  const tryStartSearch = (): boolean => {
    attempts += 1;
    const searchButton = document.querySelector<HTMLElement>("#dosearch");
    if (searchButton !== null && isVisibleElement(searchButton)) {
      removePanFlightsAutoSearchParam();
      searchButton.click();
      return true;
    }
    return attempts >= 80;
  };

  if (tryStartSearch()) return;
  timerId = window.setInterval(() => {
    if (tryStartSearch() && timerId !== undefined) {
      window.clearInterval(timerId);
    }
  }, 250);
}

function isPanFlightsSearchPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return (hostname === "panflights.no" || hostname === "panflights.com") &&
    /(?:^|\/)(?:nb\/)?(?:roundtrip|oneway)\/?$/i.test(parsedUrl.pathname);
}

function removePanFlightsAutoSearchParam(): void {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) return;
  parsedUrl.searchParams.delete(PANFLIGHTS_AUTO_SEARCH_PARAM);
  window.history.replaceState(window.history.state, "", parsedUrl.toString());
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.getClientRects().length > 0;
}

function hasBlockedHostname(blockedHosts: ReadonlySet<string>, hostname: string): boolean {
  return [...blockedHosts].some((blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`));
}

async function renderCurrentContext(): Promise<void> {
  const [offers, priceMatches, regionPrices] = await Promise.all([
    getCurrentOffers().catch(() => []),
    getPriceMatchesForCurrentPage().catch(() => []),
    getRegionPricesForCurrentPage().catch(() => undefined),
  ]);
  if (offers.length > 0 || priceMatches.length > 0 || (regionPrices?.prices.length ?? 0) > 0) {
    renderNoticeWithStoredState(offers, priceMatches, regionPrices);
    return;
  }
  clearNotice();
}

async function getCurrentOffers(): Promise<CashbackOffer[]> {
  const message: GetOffersForUrlMessage = {
    type: "get-offers-for-url",
    url: window.location.href,
  };
  const response = await sendRuntimeMessage<OffersForUrlResponse>(message);
  if (response !== undefined && isOffersForUrlResponse(response) && response.ok) {
    if (response.offers.length > 0) return response.offers;
  }
  return readBundledOffersForCurrentUrl();
}
async function readBundledOffersForCurrentUrl(): Promise<CashbackOffer[]> {
  const parsedUrl = parseUrl(window.location.href);
  if (
    parsedUrl === undefined ||
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
  ) {
    return [];
  }
  try {
    const response = await fetch(chrome.runtime.getURL("cashback-index.json"));
    const value: unknown = await response.json();
    if (!isCashbackIndex(value)) {
      return [];
    }
    return findOffersForHostname(value, parsedUrl.hostname);
  } catch {
    return [];
  }
}

async function getPriceMatchesForCurrentPage(): Promise<PriceMatchOffer[]> {
  const flightOffers = await findFlightPriceMatchOffers();
  if (flightOffers.length > 0) return flightOffers;

  const productMeta = extractProductPageMeta();
  if (productMeta === undefined) return [];
  const message: GetPriceMatchForProductMessage = {
    type: "get-price-match-for-product",
    ...productMeta,
  };
  if (isUserscriptRuntime()) {
    return findPriceMatches(message, userscriptJsonRequest, userscriptTextRequest);
  }

  const response = await sendRuntimeMessage<PriceMatchForProductResponse>(message);
  if (response !== undefined && isPriceMatchForProductResponse(response) && response.ok) {
    return response.offers ?? (response.offer !== undefined ? [response.offer] : []);
  }
  return [];
}

async function findFlightPriceMatchOffers(): Promise<PriceMatchOffer[]> {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) return [];

  const flightMeta = extractFlightSearchMeta(parsedUrl);
  if (flightMeta === undefined || !isFlightSearchPassengerMatchSupported(flightMeta)) return [];

  const routeTitle = `${flightMeta.origin} -> ${flightMeta.destination}`;
  const fullSearchDetails = [
    formatFlightDateRange(flightMeta),
    formatFlightPassengerText(flightMeta),
    "samme flyplasser",
  ].join(", ");
  const cardSearchDetails = formatFlightCardSearchDetails(flightMeta);

  const staticOffers = [
    buildFlightPriceMatchOffer({
      source: "finnreise",
      sourceName: "FINN",
      productUrl: buildFinnFlightSearchUrl(flightMeta),
      routeTitle,
      cardSearchDetails,
      fullSearchDetails,
    }),
    buildFlightPriceMatchOffer({
      source: "panflights",
      sourceName: "PanFlights",
      productUrl: buildPanFlightsFlightSearchUrl(flightMeta),
      routeTitle,
      cardSearchDetails,
      fullSearchDetails,
    }),
  ];

  const liveOffers = (await Promise.all([
    safelyFindFlightPriceMatchOffer(() => findFinnFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
    safelyFindFlightPriceMatchOffer(() => findPanFlightsFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
    safelyFindFlightPriceMatchOffer(() => findMomondoFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
    safelyFindFlightPriceMatchOffer(() => findSkyscannerFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
    safelyFindFlightPriceMatchOffer(() => findTravellinkFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
    safelyFindFlightPriceMatchOffer(() => findTripComFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails)),
  ])).filter((offer): offer is PriceMatchOffer => offer !== undefined);
  if (liveOffers.length === 0) return staticOffers;

  const liveSources = new Set(liveOffers.map((offer) => offer.source));
  return [
    ...liveOffers,
    ...staticOffers.filter((offer) => !liveSources.has(offer.source)),
  ].sort(comparePriceMatchesBySortAmount);
}

async function safelyFindFlightPriceMatchOffer(
  findOffer: () => Promise<PriceMatchOffer | undefined>,
): Promise<PriceMatchOffer | undefined> {
  try {
    return await findOffer();
  } catch {
    return undefined;
  }
}

function extractFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  return extractSasFlightSearchMeta(parsedUrl) ??
    extractFinnFlightSearchMeta(parsedUrl) ??
    extractPanFlightsFlightSearchMeta(parsedUrl) ??
    extractMomondoFlightSearchMeta(parsedUrl) ??
    extractSkyscannerFlightSearchMeta(parsedUrl) ??
    extractTravellinkFlightSearchMeta(parsedUrl) ??
    extractTripComFlightSearchMeta(parsedUrl) ??
    extractStoredFlightSearchMeta(parsedUrl) ??
    extractVisibleFlightSearchMeta(parsedUrl);
}

function extractSasFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "sas.no" || !/^\/book-new\/revenue\/flights\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }

  const origin = readIataCodeParam(parsedUrl, "origin");
  const destination = readIataCodeParam(parsedUrl, "destination");
  const outboundDate = readIsoDateParam(parsedUrl, "outboundDate");
  const inboundDate = readIsoDateParam(parsedUrl, "inboundDate");
  if (origin === undefined || destination === undefined || outboundDate === undefined) {
    return undefined;
  }

  const adults = readNonNegativeIntegerParam(parsedUrl, "adults", 1);
  const youths = readNonNegativeIntegerParam(parsedUrl, "youths", 0);
  const children = readNonNegativeIntegerParam(parsedUrl, "children", 0);
  const infants = readNonNegativeIntegerParam(parsedUrl, "infants", 0);
  if (adults + youths + children + infants <= 0) return undefined;

  return {
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults,
    youths,
    children,
    infants,
  };
}

function extractFinnFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "finn.no" || !/^\/reise\/flybilletter\/resultat\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }

  const origin = readIataCodeFromValues([
    parsedUrl.searchParams.get("departureAirportLeg1"),
    parsedUrl.searchParams.get("requestedOrigin"),
  ]);
  const destination = readIataCodeFromValues([
    parsedUrl.searchParams.get("arrivalAirportLeg1"),
    parsedUrl.searchParams.get("requestedDestination"),
  ]);
  const outboundDate = readIsoDateFromValues([
    parsedUrl.searchParams.get("requestedDepartureDate"),
    parsedUrl.searchParams.get("departureDate"),
  ]);
  const inboundDate = readIsoDateFromValues([
    parsedUrl.searchParams.get("requestedReturnDate"),
    parsedUrl.searchParams.get("returnDate"),
  ]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? 1,
    youths: 0,
    children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
    infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0,
  });
}

function extractPanFlightsFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  if (!isPanFlightsSearchPage(parsedUrl)) return undefined;

  const v2 = parsedUrl.searchParams.get("v2");
  if (v2 === null) return undefined;

  const parts = v2.split("_");
  const origin = readPanFlightsPlaceIataCode(parts[0]);
  const destination = readPanFlightsPlaceIataCode(parts[1]);
  const outboundDate = readCompactIsoDateValue(parts[2]);
  const inboundDate = readCompactIsoDateValue(parts[3]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ??
      readPositiveIntegerValue(parsedUrl.searchParams.get("ad")) ??
      1,
    youths: 0,
    children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
    infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0,
  });
}

function readPanFlightsPlaceIataCode(value: string | undefined): string | undefined {
  const directCode = readIataCodeValue(value);
  if (directCode !== undefined) return directCode;
  if (value === undefined || !/^\d{4}$/.test(value)) return undefined;

  const sid2CodesMatch = document.documentElement.innerHTML.match(
    new RegExp(`[,{]\\s*["']?${value}["']?\\s*:\\s*["']([A-Z]{3}(?:,[A-Z]{3})*)["']`),
  );
  return readIataCodeValue(sid2CodesMatch?.[1]?.split(",")[0]);
}

function extractMomondoFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "momondo.no" || !/^\/flight-search\/[^/]+\/\d{4}-\d{2}-\d{2}(?:\/\d{4}-\d{2}-\d{2})?\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }

  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  const routePart = parts[1];
  const routeParts = routePart?.split("-");
  const origin = readIataCodeValue(routeParts?.[0]);
  const destination = readIataCodeValue(routeParts?.[1]);
  const outboundDate = readIsoDateValue(parts[2]);
  const inboundDate = readIsoDateValue(parts[3]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? 1,
    youths: 0,
    children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
    infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0,
  });
}

function extractSkyscannerFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  if (!isSkyscannerFlightSearchPage(parsedUrl)) return undefined;

  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  const flightsIndex = parts.findIndex((part) => part.toLowerCase() === "flights");
  const origin = readIataCodeValue(parts[flightsIndex + 1]);
  const destination = readIataCodeValue(parts[flightsIndex + 2]);
  const outboundDate = readSkyscannerPathDate(parts[flightsIndex + 3]);
  const inboundDate = readSkyscannerPathDate(parts[flightsIndex + 4]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ??
      readPositiveIntegerValue(parsedUrl.searchParams.get("adultsv2")) ??
      1,
    youths: 0,
    children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ??
      readNonNegativeIntegerValue(parsedUrl.searchParams.get("childrenv2")) ??
      0,
    infants: 0,
  });
}

function extractTravellinkFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "travellink.no" || !/^\/travel\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }

  const params = readTravellinkHashParams(parsedUrl.hash);
  const origin = readIataCodeValue(params.get("from"));
  const destination = readIataCodeValue(params.get("to"));
  const outboundDate = readIsoDateValue(params.get("dep"));
  const inboundDate = readIsoDateValue(params.get("ret"));
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(params.get("adults")) ??
      readPositiveIntegerValue(params.get("numAdults")) ??
      readPositiveIntegerValue(params.get("adt")) ??
      1,
    youths: 0,
    children: readNonNegativeIntegerValue(params.get("children")) ?? 0,
    infants: readNonNegativeIntegerValue(params.get("infants")) ?? 0,
  });
}

function readTravellinkHashParams(hash: string): URLSearchParams {
  const params = new URLSearchParams();
  const payload = hash.replace(/^#/, "").replace(/^results\/?/, "");
  for (const part of payload.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key.length > 0) params.set(key, decodeURIComponent(value));
  }
  return params;
}

function extractTripComFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (!hostname.endsWith("trip.com") || !/^\/flights\/showfarefirst\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }

  const origin = readIataCodeParam(parsedUrl, "dcity");
  const destination = readIataCodeParam(parsedUrl, "acity");
  const outboundDate = readIsoDateParam(parsedUrl, "ddate");
  const inboundDate = /^rt$/i.test(parsedUrl.searchParams.get("triptype") ?? "")
    ? readIsoDateParam(parsedUrl, "rdate")
    : undefined;
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(parsedUrl.searchParams.get("quantity")) ?? 1,
    youths: 0,
    children: 0,
    infants: 0,
  });
}

function isSkyscannerFlightSearchPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return (hostname === "skyscanner.no" || hostname === "skyscanner.net") &&
    /^\/transport\/flights\/[a-z]{3}\/[a-z]{3}\/\d{6}(?:\/\d{6})?\/?$/i.test(parsedUrl.pathname);
}

function readSkyscannerPathDate(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{6}$/.test(value)) return undefined;
  const year = Number.parseInt(value.slice(0, 2), 10);
  const fullYear = year < 70 ? 2000 + year : 1900 + year;
  return readIsoDateValue(`${fullYear}-${value.slice(2, 4)}-${value.slice(4, 6)}`);
}

function extractStoredFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  if (!isOpaqueFlightSearchPage(parsedUrl)) return undefined;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === null) continue;
      const value = storage.getItem(key);
      const meta = extractFlightSearchMetaFromUnknown(value);
      if (meta !== undefined) return meta;
    }
  }

  return undefined;
}

function extractFlightSearchMetaFromUnknown(value: unknown, depth = 0): FlightSearchMeta | undefined {
  if (depth > 5) return undefined;

  if (typeof value === "string") {
    const parsedJson = parseJsonValue(value);
    if (parsedJson !== undefined) {
      const jsonMeta = extractFlightSearchMetaFromUnknown(parsedJson, depth + 1);
      if (jsonMeta !== undefined) return jsonMeta;
    }

    if (value.includes("=")) {
      const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
      const paramsMeta = readFlightSearchMetaFromParams(params);
      if (paramsMeta !== undefined) return paramsMeta;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const meta = extractFlightSearchMetaFromUnknown(item, depth + 1);
      if (meta !== undefined) return meta;
    }
    return undefined;
  }

  if (!isRecord(value)) return undefined;

  const recordMeta = readFlightSearchMetaFromRecord(value);
  if (recordMeta !== undefined) return recordMeta;

  for (const item of Object.values(value)) {
    const meta = extractFlightSearchMetaFromUnknown(item, depth + 1);
    if (meta !== undefined) return meta;
  }
  return undefined;
}

function readFlightSearchMetaFromParams(params: URLSearchParams): FlightSearchMeta | undefined {
  const origin = readIataCodeFromValues([
    params.get("origin"),
    params.get("from"),
    params.get("originAirport"),
    params.get("departureAirport"),
  ]);
  const destination = readIataCodeFromValues([
    params.get("destination"),
    params.get("to"),
    params.get("destinationAirport"),
    params.get("arrivalAirport"),
  ]);
  const outboundDate = readIsoDateFromValues([
    params.get("outboundDate"),
    params.get("departureDate"),
    params.get("fromDate"),
  ]);
  const inboundDate = readIsoDateFromValues([
    params.get("inboundDate"),
    params.get("returnDate"),
    params.get("toDate"),
  ]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerValue(params.get("adults")) ?? 1,
    youths: 0,
    children: readNonNegativeIntegerValue(params.get("children")) ?? 0,
    infants: readNonNegativeIntegerValue(params.get("infants")) ?? 0,
  });
}

function readFlightSearchMetaFromRecord(record: Record<string, unknown>): FlightSearchMeta | undefined {
  const origin = readIataCodeFromRecord(record, [
    "origin",
    "originCode",
    "originAirport",
    "originAirportCode",
    "from",
    "fromAirport",
    "fromAirportCode",
    "departureAirport",
    "departureAirportCode",
    "departureStation",
    "departureStationCode",
  ]);
  const destination = readIataCodeFromRecord(record, [
    "destination",
    "destinationCode",
    "destinationAirport",
    "destinationAirportCode",
    "to",
    "toAirport",
    "toAirportCode",
    "arrivalAirport",
    "arrivalAirportCode",
    "arrivalStation",
    "arrivalStationCode",
  ]);
  const outboundDate = readIsoDateFromRecord(record, [
    "outboundDate",
    "departureDate",
    "departureDateTime",
    "dateDeparture",
    "fromDate",
  ]);
  const inboundDate = readIsoDateFromRecord(record, [
    "inboundDate",
    "returnDate",
    "returnDateTime",
    "dateReturn",
    "toDate",
  ]);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: readPositiveIntegerFromRecord(record, ["adults", "adultCount", "numberOfAdults", "adt"]) ?? 1,
    youths: 0,
    children: readNonNegativeIntegerFromRecord(record, ["children", "childCount", "numberOfChildren", "chd"]) ?? 0,
    infants: readNonNegativeIntegerFromRecord(record, ["infants", "infantCount", "numberOfInfants", "inf"]) ?? 0,
  });
}

function extractVisibleFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  if (!isOpaqueFlightSearchPage(parsedUrl)) return undefined;

  const haystack = collectVisibleFlightSearchText();
  const iataCodes = [...new Set(haystack.match(/\b[A-Z]{3}\b/g) ?? [])]
    .filter((code) => !["URL", "HTML", "CSS", "API", "FAQ"].includes(code));
  const dates = [
    ...collectIsoDates(haystack),
    ...collectLocalizedFlightDates(haystack),
  ];
  const origin = iataCodes[0];
  const destination = iataCodes[1];
  const outboundDate = dates[0];
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(dates[1] !== undefined ? { inboundDate: dates[1] } : {}),
    adults: readVisibleAdultCount(haystack) ?? 1,
    youths: 0,
    children: 0,
    infants: 0,
  });
}

function collectVisibleFlightSearchText(): string {
  const parts = [document.body?.innerText ?? ""];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("input, [aria-label], [data-testid], [data-test-id]")).slice(0, 200)) {
    if (element instanceof HTMLInputElement && element.value.trim().length > 0) {
      parts.push(element.value);
    }
    for (const attribute of ["aria-label", "data-testid", "data-test-id"]) {
      const value = element.getAttribute(attribute);
      if (value !== null) parts.push(value);
    }
  }
  return parts.join("\n");
}

function collectIsoDates(value: string): string[] {
  return [...new Set(value.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [])]
    .filter((date) => readIsoDateValue(date) !== undefined);
}

function collectLocalizedFlightDates(value: string): string[] {
  const months: Record<string, string> = {
    jan: "01",
    januar: "01",
    feb: "02",
    februar: "02",
    mar: "03",
    mars: "03",
    apr: "04",
    april: "04",
    mai: "05",
    may: "05",
    jun: "06",
    juni: "06",
    june: "06",
    jul: "07",
    juli: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    okt: "10",
    oct: "10",
    oktober: "10",
    october: "10",
    nov: "11",
    november: "11",
    des: "12",
    dec: "12",
    desember: "12",
    december: "12",
  };
  const dates: string[] = [];
  const rangeMatcher = /\b(\d{1,2})\.?\s*[-–]\s*(?:[a-z]{2,4}\.?\s*)?(\d{1,2})\.?\s*(jan(?:uar)?|feb(?:ruar)?|mar(?:s)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:t|tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\.?\s*(20\d{2})?\b/gi;
  for (const match of value.matchAll(rangeMatcher)) {
    const startDay = match[1]?.padStart(2, "0");
    const endDay = match[2]?.padStart(2, "0");
    const month = months[match[3]?.toLowerCase() ?? ""];
    const year = match[4] ?? inferFlightSearchYear(month, startDay);
    for (const day of [startDay, endDay]) {
      if (day === undefined || month === undefined || year === undefined) continue;
      const date = readIsoDateValue(`${year}-${month}-${day}`);
      if (date !== undefined && !dates.includes(date)) dates.push(date);
    }
  }

  const matcher = /\b(\d{1,2})\.?\s*(jan(?:uar)?|feb(?:ruar)?|mar(?:s)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:t|tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\.?\s*(20\d{2})?\b/gi;
  for (const match of value.matchAll(matcher)) {
    const day = match[1]?.padStart(2, "0");
    const month = months[match[2]?.toLowerCase() ?? ""];
    const year = match[3] ?? inferFlightSearchYear(month, day);
    if (day === undefined || month === undefined || year === undefined) continue;
    const date = readIsoDateValue(`${year}-${month}-${day}`);
    if (date !== undefined && !dates.includes(date)) dates.push(date);
  }
  return dates;
}

function inferFlightSearchYear(month: string | undefined, day: string | undefined): string | undefined {
  if (month === undefined || day === undefined) return undefined;
  const now = new Date();
  const currentYear = now.getFullYear();
  const candidate = `${currentYear}-${month}-${day}`;
  const candidateDate = new Date(`${candidate}T23:59:59Z`);
  return candidateDate.getTime() >= Date.now()
    ? String(currentYear)
    : String(currentYear + 1);
}

function readVisibleAdultCount(value: string): number | undefined {
  const match = value.match(/\b(\d+)\s*(?:voksen|voksne|adult|adults)\b/i);
  return readPositiveIntegerValue(match?.[1]);
}

function normalizeFlightSearchMeta(meta: FlightSearchMeta): FlightSearchMeta | undefined {
  const origin = readIataCodeValue(meta.origin);
  const destination = readIataCodeValue(meta.destination);
  const outboundDate = readIsoDateValue(meta.outboundDate);
  const inboundDate = meta.inboundDate !== undefined ? readIsoDateValue(meta.inboundDate) : undefined;
  if (origin === undefined || destination === undefined || outboundDate === undefined || origin === destination) {
    return undefined;
  }
  const normalizedMeta: FlightSearchMeta = {
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: Math.max(1, Math.trunc(meta.adults)),
    youths: Math.max(0, Math.trunc(meta.youths)),
    children: Math.max(0, Math.trunc(meta.children)),
    infants: Math.max(0, Math.trunc(meta.infants)),
  };
  return isFlightSearchPassengerMatchSupported(normalizedMeta) ? normalizedMeta : undefined;
}

function isOpaqueFlightSearchPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return (hostname === "shop.lufthansa.com" && /^\/booking\/availability\/\d+\/?$/i.test(parsedUrl.pathname)) ||
    (hostname === "booking.norwegian.com" && /^\/booking\/flight\/\d+\/?$/i.test(parsedUrl.pathname));
}

function isFlightSearchPassengerMatchSupported(flightMeta: FlightSearchMeta): boolean {
  return flightMeta.adults > 0 && flightMeta.youths === 0 && flightMeta.children === 0 && flightMeta.infants === 0;
}

function buildFlightPriceMatchOffer(input: {
  source: NonNullable<PriceMatchOffer["source"]>;
  sourceName: string;
  productUrl: string;
  routeTitle: string;
  cardSearchDetails: string;
  fullSearchDetails: string;
}): PriceMatchOffer {
  return {
    source: input.source,
    sourceName: input.sourceName,
    details: input.fullSearchDetails,
    matchedExactProduct: true,
    shopName: input.cardSearchDetails,
    price: "Sjekk pris",
    amount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
    sortAmount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
    currency: "NOK",
    productName: input.routeTitle,
    productUrl: input.productUrl,
  };
}

async function findFinnFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  const resultUrl = buildFinnFlightSearchUrl(flightMeta);
  const searchData = await fetchFinnFlightSearchData(resultUrl);
  if (searchData === undefined) return undefined;

  const resultData = await pollFinnFlightResults(searchData, flightMeta);
  if (resultData === undefined) return undefined;

  const candidates = extractFinnFlightOfferCandidates(resultData, searchData.searchId, flightMeta);
  const best = candidates[0];
  if (best === undefined) return undefined;

  return {
    source: "finnreise",
    sourceName: "FINN",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: best.shopName,
    price: best.price,
    amount: best.amount,
    sortAmount: best.sortAmount ?? best.amount,
    currency: best.currency,
    productName: routeTitle,
    productUrl: searchData.resultUrl,
    offerUrl: best.productUrl,
    alternatives: candidates.map(({ productUrl: _productUrl, ...candidate }) => candidate),
  };
}

async function fetchFinnFlightSearchData(resultUrl: string): Promise<FinnFlightSearchData | undefined> {
  const html = await userscriptTextRequest(resultUrl, {
    headers: { Accept: "text/html" },
    credentials: "omit",
  });
  if (html === undefined) return undefined;

  const nextData = parseFinnNextData(html);
  const pageProps = isRecord(nextData?.props) && isRecord(nextData.props.pageProps)
    ? nextData.props.pageProps
    : undefined;
  const searchData = isRecord(pageProps?.searchData) ? pageProps.searchData : undefined;
  const config = isRecord(pageProps?.config) ? pageProps.config : undefined;
  const searchId = readStringValue(searchData?.searchId);
  if (searchId === undefined) return undefined;

  return {
    searchId,
    flightApiUrl: readStringValue(config?.flightApiUrl) ?? FINN_FLIGHT_API_FALLBACK_URL,
    resultUrl,
  };
}

function parseFinnNextData(html: string): Record<string, unknown> | undefined {
  const match = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (match?.[1] === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function pollFinnFlightResults(
  searchData: FinnFlightSearchData,
  flightMeta: FlightSearchMeta,
): Promise<Record<string, unknown> | undefined> {
  let latestResult: Record<string, unknown> | undefined;
  let progress = 0;

  for (let attempt = 0; attempt < FINN_FLIGHT_POLL_ATTEMPTS; attempt++) {
    await sleep(FINN_FLIGHT_POLL_INTERVAL_MS);
    const resultUrl = buildFinnFlightResultApiUrl(searchData.flightApiUrl, searchData.searchId, flightMeta, progress);
    const value = await userscriptJsonRequest(resultUrl, {
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!isRecord(value) || !Array.isArray(value.trips)) continue;

    latestResult = value;
    progress = readNumberValue(value.progress) ?? progress;
    if (progress >= 100) break;
  }

  return latestResult;
}

function buildFinnFlightResultApiUrl(
  flightApiUrl: string,
  searchId: string,
  flightMeta: FlightSearchMeta,
  progress: number,
): string {
  const params = buildFinnFlightExactAirportParams(flightMeta);
  params.set("cacheBuster", String(Date.now()));
  params.set("progress", String(progress));
  return `${flightApiUrl.replace(/\/$/, "")}/result/${encodeURIComponent(searchId)}?${params.toString()}`;
}

function extractFinnFlightOfferCandidates(
  resultData: Record<string, unknown>,
  searchId: string,
  flightMeta: FlightSearchMeta,
): FinnFlightOfferCandidate[] {
  const candidates: FinnFlightOfferCandidate[] = [];

  for (const trip of readRecordArray(resultData.trips)) {
    if (!isFinnFlightTripMatchingSearch(trip, flightMeta)) continue;

    const tripSummary = formatFinnFlightTripSummary(trip);
    for (const offer of readRecordArray(trip.offers)) {
      const amount = readNumberValue(offer.priceAmount);
      const shopName = readStringValue(offer.brand);
      const offerId = readStringValue(offer.offerId);
      if (amount === undefined || shopName === undefined || offerId === undefined) continue;

      const platform = [
        tripSummary,
        formatFinnFlightLuggageSummary(offer),
      ].filter((part): part is string => part !== undefined && part.length > 0).join(", ");

      candidates.push({
        shopName,
        price: formatNokFlightPrice(amount),
        amount,
        sortAmount: amount,
        currency: "NOK",
        productUrl: buildFinnFlightOfferUrl(searchId, offerId),
        ...(platform.length > 0 ? { platform } : {}),
      });
    }
  }

  return dedupeFinnFlightOfferCandidates(candidates);
}

function dedupeFinnFlightOfferCandidates(candidates: FinnFlightOfferCandidate[]): FinnFlightOfferCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidates: FinnFlightOfferCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.shopName,
      candidate.amount,
      candidate.platform ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }
  return uniqueCandidates;
}

function isFinnFlightTripMatchingSearch(trip: Record<string, unknown>, flightMeta: FlightSearchMeta): boolean {
  const legs = readRecordArray(trip.legs);
  const outboundLeg = legs[0];
  if (outboundLeg === undefined || !isFinnFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, flightMeta.outboundDate)) {
    return false;
  }

  if (flightMeta.inboundDate === undefined) return true;

  const inboundLeg = legs[1];
  return inboundLeg !== undefined && isFinnFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, flightMeta.inboundDate);
}

function isFinnFlightLegMatch(leg: Record<string, unknown>, origin: string, destination: string, date: string): boolean {
  return readFinnFlightLegAirport(leg, "legOrigin", "origin") === origin &&
    readFinnFlightLegAirport(leg, "legDestination", "destination") === destination &&
    readFinnFlightLegDate(leg) === date;
}

function readFinnFlightLegAirport(
  leg: Record<string, unknown>,
  legKey: "legOrigin" | "legDestination",
  segmentKey: "origin" | "destination",
): string | undefined {
  const legAirport = readStringValue(leg[legKey]);
  if (legAirport !== undefined) return legAirport.toUpperCase();

  const firstSegment = readRecordArray(leg.segments)[0];
  return readStringValue(firstSegment?.[segmentKey])?.toUpperCase();
}

function readFinnFlightLegDate(leg: Record<string, unknown>): string | undefined {
  const legDepartureTime = readStringValue(leg.legDepartureTime);
  const firstSegment = readRecordArray(leg.segments)[0];
  const segmentDepartureTime = readStringValue(firstSegment?.departureTime);
  return (legDepartureTime ?? segmentDepartureTime)?.slice(0, 10);
}

function buildFinnFlightOfferUrl(searchId: string, offerId: string): string {
  const params = new URLSearchParams({ searchId, offerId });
  return `https://www.finn.no/reise/flybilletter/ut/?${params.toString()}`;
}

function buildFinnFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const params = new URLSearchParams({
    adults: String(flightMeta.adults),
    cabinType: "economy",
    requestedDepartureDate: flightMeta.outboundDate,
    requestedDestination: `${flightMeta.destination}.AIRPORT`,
    requestedOrigin: `${flightMeta.origin}.AIRPORT`,
    tripType: flightMeta.inboundDate !== undefined ? "roundtrip" : "oneway",
  });
  const exactAirportParams = buildFinnFlightExactAirportParams(flightMeta);
  for (const [key, value] of exactAirportParams.entries()) {
    params.set(key, value);
  }
  if (flightMeta.inboundDate !== undefined) {
    params.set("requestedReturnDate", flightMeta.inboundDate);
  }
  return `https://www.finn.no/reise/flybilletter/resultat/?${params.toString()}`;
}

function buildFinnFlightExactAirportParams(flightMeta: FlightSearchMeta): URLSearchParams {
  const params = new URLSearchParams({
    departureAirportLeg1: flightMeta.origin,
    arrivalAirportLeg1: flightMeta.destination,
  });
  if (flightMeta.inboundDate !== undefined) {
    params.set("departureAirportLeg2", flightMeta.destination);
    params.set("arrivalAirportLeg2", flightMeta.origin);
  }
  return params;
}

async function findPanFlightsFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  const resultUrl = buildPanFlightsFlightSearchUrl(flightMeta);
  const resultDataList = await Promise.all(
    PANFLIGHTS_FLIGHT_SEARCH_VARIANTS.map((variant) => fetchPanFlightsFlightSearchResult(flightMeta, variant)),
  );
  const candidates = dedupePanFlightsOfferCandidates(
    resultDataList.flatMap((resultData) => {
      return resultData === undefined
        ? []
        : extractPanFlightsOfferCandidates(resultData, flightMeta, resultUrl);
    }),
  );
  const rankedCandidates = rankPanFlightsOfferCandidates(candidates);

  const best = rankedCandidates[0];
  if (best === undefined) return undefined;

  return {
    source: "panflights",
    sourceName: "PanFlights",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: best.shopName,
    price: best.price,
    amount: best.amount,
    sortAmount: best.sortAmount ?? best.amount,
    currency: best.currency,
    productName: routeTitle,
    productUrl: resultUrl,
    offerUrl: best.productUrl,
    alternatives: rankedCandidates.map(({ productUrl: _productUrl, durationMinutes: _durationMinutes, ...candidate }) => candidate),
  };
}

async function fetchPanFlightsFlightSearchResult(
  flightMeta: FlightSearchMeta,
  variant: PanFlightsSearchVariant,
): Promise<Record<string, unknown> | undefined> {
  const body = new URLSearchParams({
    data: JSON.stringify(buildPanFlightsFlightSearchPayload(flightMeta, variant)),
  }).toString();

  for (const endpoint of PANFLIGHTS_FLIGHT_SEARCH_ENDPOINTS) {
    const value = await userscriptJsonRequest(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
      credentials: "omit",
    });
    if (isRecord(value) && Array.isArray(value.flighttab)) return value;
  }

  return undefined;
}

function buildPanFlightsFlightSearchPayload(
  flightMeta: FlightSearchMeta,
  variant: PanFlightsSearchVariant,
): Record<string, unknown> {
  const outboundDate = splitIsoDateParts(flightMeta.outboundDate);
  const inboundDate = flightMeta.inboundDate !== undefined ? splitIsoDateParts(flightMeta.inboundDate) : undefined;
  const leg: Record<string, string> = {
    dffd: outboundDate.day,
    dftd: outboundDate.day,
    dffm: outboundDate.month,
    dftm: outboundDate.month,
    dffy: outboundDate.year,
    dfty: outboundDate.year,
    fromlocsid: flightMeta.origin,
    fromlocrad: "0",
    fromloclat: "0",
    fromloclng: "0",
    tolocsid: flightMeta.destination,
    tolocrad: "0",
    toloclat: "0",
    toloclng: "0",
    somin: "0",
    somax: "96",
  };

  if (inboundDate !== undefined) {
    leg.dtfd = inboundDate.day;
    leg.dttd = inboundDate.day;
    leg.dtfm = inboundDate.month;
    leg.dttm = inboundDate.month;
    leg.dtfy = inboundDate.year;
    leg.dtty = inboundDate.year;
  }

  return {
    getmode: "searchflights",
    timefilters: inboundDate !== undefined ? [0, 24, 0, 24, 0, 24, 0, 24] : [0, 24, 0, 24],
    typeFlight: inboundDate !== undefined ? "round" : "oneway",
    sortorder: variant.sortOrder,
    sortradio: variant.sortRadio,
    mode: "search",
    submode: "",
    locale: "nb",
    market: "no",
    hitslimit: PANFLIGHTS_FLIGHT_HITS_LIMIT,
    calupdate: 0,
    cc: "0",
    oneforcity: "0",
    oneperdate: "0",
    currency: "NOK",
    adults: String(flightMeta.adults),
    children: "0",
    infants: "0",
    class: "Y",
    carryons: 0,
    checkedluggages: 0,
    airlines: "",
    airports: "",
    endairports: "",
    stopovers: "",
    maxstops: variant.maxStops,
    useragent: navigator.userAgent,
    devicetype: "PC",
    bundle: JSON.stringify({ addc: "1" }),
    minprice: 0,
    maxprice: 999999999999,
    leglist: [leg],
    searchid: variant.searchId,
    user_ip: "127.0.0.1",
    version: variant.version,
  };
}

function extractPanFlightsOfferCandidates(
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
  resultUrl: string,
): PanFlightsOfferCandidate[] {
  const currency = readStringValue(resultData.currency) ?? "NOK";
  const candidates: PanFlightsOfferCandidate[] = [];

  for (const item of readRecordArray(resultData.flighttab)) {
    if (!isPanFlightsFlightMatchingSearch(item, flightMeta)) continue;

    const packageRecord = readPanFlightsPackageRecord(item);
    const provider = readPanFlightsBestProvider(resultData, item);
    const amount = readPositiveNumberValue(provider?.price) ??
      readPositiveNumberValue(item.price) ??
      readPositiveNumberValue(packageRecord?.price);
    if (amount === undefined) continue;

    const deepLink = provider?.deep_link ?? packageRecord?.deep_link;
    const productUrl = readPanFlightsProductUrl(deepLink, resultUrl);
    const shopName = readStringValue(provider?.provider) ??
      readStringValue(item.provider) ??
      readStringValue(packageRecord?.provider) ??
      readPanFlightsProviderNameFromUrl(deepLink) ??
      readStringValue(resultData.provider) ??
      "PanFlights";
    const durationMinutes = readNumberValue(packageRecord?.duration) ?? readNumberValue(item.duration);
    const platform = formatPanFlightsTripSummary(item);

    candidates.push({
      shopName,
      price: formatNokFlightPrice(amount),
      amount,
      sortAmount: amount,
      currency,
      productUrl,
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      ...(platform !== undefined ? { platform } : {}),
    });
  }

  return candidates;
}

function dedupePanFlightsOfferCandidates(candidates: PanFlightsOfferCandidate[]): PanFlightsOfferCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidates: PanFlightsOfferCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.shopName,
      Math.round(candidate.amount),
      candidate.platform ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }
  return uniqueCandidates;
}

function rankPanFlightsOfferCandidates(candidates: PanFlightsOfferCandidate[]): PanFlightsOfferCandidate[] {
  const shortestDuration = candidates.reduce<number | undefined>((shortest, candidate) => {
    if (candidate.durationMinutes === undefined) return shortest;
    return shortest === undefined ? candidate.durationMinutes : Math.min(shortest, candidate.durationMinutes);
  }, undefined);
  const maxReasonableDuration = calculateMaxReasonableFlightDuration(shortestDuration);

  return [...candidates].sort((left, right) => {
    const leftReasonable = isReasonablePanFlightsDuration(left, maxReasonableDuration);
    const rightReasonable = isReasonablePanFlightsDuration(right, maxReasonableDuration);
    if (leftReasonable !== rightReasonable) return leftReasonable ? -1 : 1;

    const amountDiff = (left.sortAmount ?? left.amount) - (right.sortAmount ?? right.amount);
    if (amountDiff !== 0) return amountDiff;

    return (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.durationMinutes ?? Number.MAX_SAFE_INTEGER);
  });
}

function calculateMaxReasonableFlightDuration(shortestDuration: number | undefined): number | undefined {
  if (shortestDuration === undefined) return undefined;
  if (shortestDuration >= 600) return shortestDuration * 2;
  return shortestDuration + PANFLIGHTS_REASONABLE_DURATION_BUFFER_MINUTES;
}

function isReasonablePanFlightsDuration(
  candidate: PanFlightsOfferCandidate,
  maxReasonableDuration: number | undefined,
): boolean {
  if (maxReasonableDuration === undefined || candidate.durationMinutes === undefined) return true;
  return candidate.durationMinutes <= maxReasonableDuration;
}

function isPanFlightsFlightMatchingSearch(item: Record<string, unknown>, flightMeta: FlightSearchMeta): boolean {
  const routeList = readRecordArray(readPanFlightsPackageRecord(item)?.routelist);
  const outboundRoute = routeList[0];
  if (
    outboundRoute === undefined ||
    !isPanFlightsRouteLegMatch(outboundRoute, "tripdata", "dTime", flightMeta.origin, flightMeta.destination, flightMeta.outboundDate)
  ) {
    return false;
  }

  const inboundDate = flightMeta.inboundDate;
  if (inboundDate === undefined) return true;

  return isPanFlightsRouteLegMatch(outboundRoute, "backdata", "drTime", flightMeta.destination, flightMeta.origin, inboundDate) ||
    routeList.some((route) => {
      return isPanFlightsRouteLegMatch(route, "tripdata", "dTime", flightMeta.destination, flightMeta.origin, inboundDate);
    });
}

function isPanFlightsRouteLegMatch(
  route: Record<string, unknown>,
  dataKey: "tripdata" | "backdata",
  timeKey: "dTime" | "drTime",
  origin: string,
  destination: string,
  date: string,
): boolean {
  const legData = isRecord(route[dataKey]) ? route[dataKey] : undefined;
  return readStringValue(legData?.flyFrom)?.toUpperCase() === origin &&
    readStringValue(legData?.flyTo)?.toUpperCase() === destination &&
    formatPanFlightsEpochDate(readNumberValue(route[timeKey])) === date;
}

function readPanFlightsBestProvider(
  resultData: Record<string, unknown>,
  item: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const packageRecord = readPanFlightsPackageRecord(item);
  const providerCandidates = readRecordArray(packageRecord?.providerlist);
  const prefingerprint = readStringValue(packageRecord?.prefingerprint);
  const retparams = isRecord(resultData.retparams) ? resultData.retparams : undefined;
  const providersByFingerprint = isRecord(retparams?.providers) ? retparams.providers : undefined;
  if (prefingerprint !== undefined) {
    providerCandidates.push(...readRecordArray(providersByFingerprint?.[prefingerprint]));
  }

  return providerCandidates
    .filter((provider) => readPositiveNumberValue(provider.price) !== undefined)
    .sort((left, right) => {
      return (readPositiveNumberValue(left.price) ?? Number.MAX_SAFE_INTEGER) -
        (readPositiveNumberValue(right.price) ?? Number.MAX_SAFE_INTEGER);
    })[0];
}

function readPanFlightsPackageRecord(item: Record<string, unknown>): Record<string, unknown> | undefined {
  return isRecord(item.package) ? item.package : undefined;
}

function readPanFlightsProviderNameFromUrl(value: unknown): string | undefined {
  const url = readStringValue(value);
  if (url === undefined) return undefined;
  const hostname = parseUrlWithBase(url, "https://panflights.com/")?.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === undefined) return undefined;

  if (hostname.includes("flightnetwork")) return "Flightnetwork";
  if (hostname.includes("gotogate")) return "Gotogate";
  if (hostname.includes("mytrip")) return "Mytrip";
  if (hostname.includes("kiwi.com")) return "Kiwi.com";
  if (hostname.includes("travellink")) return "Travellink";
  if (hostname.includes("trip.com")) return "Trip.com";

  const providerLabel = hostname
    .split(".")
    .find((part) => part.length > 2 && !["com", "co", "no", "se", "dk", "net"].includes(part));
  return providerLabel === undefined
    ? undefined
    : providerLabel.charAt(0).toUpperCase() + providerLabel.slice(1);
}

function readPanFlightsProductUrl(value: unknown, fallbackUrl: string): string {
  const url = readStringValue(value);
  if (url === undefined) return fallbackUrl;
  return parseUrlWithBase(url, "https://panflights.com/")?.toString() ?? fallbackUrl;
}

function formatPanFlightsTripSummary(item: Record<string, unknown>): string | undefined {
  const packageRecord = readPanFlightsPackageRecord(item);
  const outboundRoute = readRecordArray(packageRecord?.routelist)[0];
  const parts = [
    outboundRoute !== undefined ? collectPanFlightsCarrierNames(outboundRoute).join("/") : undefined,
    outboundRoute !== undefined ? formatPanFlightsStops(outboundRoute) : undefined,
    formatPanFlightsDuration(readNumberValue(packageRecord?.duration) ?? readNumberValue(item.duration)),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function collectPanFlightsCarrierNames(route: Record<string, unknown>): string[] {
  const carriers = new Set<string>();
  for (const dataKey of ["tripdata", "backdata"] as const) {
    const legData = isRecord(route[dataKey]) ? route[dataKey] : undefined;
    for (const carrier of (readStringValue(legData?.airlines) ?? "").split(",")) {
      const trimmed = carrier.trim();
      if (trimmed.length > 0) carriers.add(trimmed);
    }
  }
  return [...carriers];
}

function formatPanFlightsStops(route: Record<string, unknown>): string | undefined {
  const stops = (["tripdata", "backdata"] as const)
    .map((dataKey) => readPanFlightsRouteLegStopCount(route, dataKey))
    .filter((stopCount): stopCount is number => stopCount !== undefined);

  if (stops.length === 0) return undefined;
  if (stops.every((stopCount) => stopCount === 0)) return "direkte";
  return stops.map((stopCount) => stopCount === 0 ? "direkte" : `${stopCount} stopp`).join(" / ");
}

function readPanFlightsRouteLegStopCount(route: Record<string, unknown>, dataKey: "tripdata" | "backdata"): number | undefined {
  const legData = isRecord(route[dataKey]) ? route[dataKey] : undefined;
  const specs = Array.isArray(legData?.spec) ? legData.spec.filter(isString) : [];
  return specs.length > 0 ? Math.max(0, specs.length - 1) : undefined;
}

function formatPanFlightsDuration(minutes: number | undefined): string | undefined {
  if (minutes === undefined) return undefined;
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours <= 0) return `${remainingMinutes} min`;
  return remainingMinutes === 0 ? `${hours} t` : `${hours} t ${remainingMinutes} min`;
}

function formatPanFlightsEpochDate(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined) return undefined;
  const date = new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function buildPanFlightsFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const outboundDate = compactIsoDate(flightMeta.outboundDate);
  const inboundDate = flightMeta.inboundDate !== undefined ? compactIsoDate(flightMeta.inboundDate) : undefined;
  const path = inboundDate !== undefined ? "roundtrip" : "oneway";
  const v2 = inboundDate !== undefined
    ? `${flightMeta.origin}_${flightMeta.destination}_${outboundDate}_${inboundDate}`
    : `${flightMeta.origin}_${flightMeta.destination}_${outboundDate}`;
  const params = new URLSearchParams({ v2, order: "quality", [PANFLIGHTS_AUTO_SEARCH_PARAM]: "1" });
  return `https://panflights.no/nb/${path}/?${params.toString()}`;
}

function buildSkyscannerFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const pathParts = [
    flightMeta.origin.toLowerCase(),
    flightMeta.destination.toLowerCase(),
    compactIsoDate(flightMeta.outboundDate).slice(2),
    flightMeta.inboundDate !== undefined ? compactIsoDate(flightMeta.inboundDate).slice(2) : undefined,
  ].filter((part): part is string => part !== undefined);
  const params = new URLSearchParams({
    adults: String(flightMeta.adults),
    adultsv2: String(flightMeta.adults),
    cabinclass: "economy",
    childrenv2: "",
    inboundaltsenabled: "false",
    outboundaltsenabled: "false",
    preferdirects: "false",
    rtn: flightMeta.inboundDate !== undefined ? "1" : "0",
  });
  return `https://www.skyscanner.no/transport/flights/${pathParts.join("/")}/?${params.toString()}`;
}

function buildTravellinkFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const params: Array<[string, string]> = [
    ["type", flightMeta.inboundDate !== undefined ? "R" : "O"],
    ["from", flightMeta.origin],
    ["to", flightMeta.destination],
    ["dep", flightMeta.outboundDate],
  ];
  if (flightMeta.inboundDate !== undefined) {
    params.push(["ret", flightMeta.inboundDate]);
  }
  params.push(
    ["buyPath", "FLIGHTS_HOME_SEARCH_FORM"],
    ["internalSearch", "true"],
  );
  const hashParams = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join(";");
  return `https://www.travellink.no/travel/#results/${hashParams}`;
}

async function findTravellinkFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  const resultUrl = buildTravellinkFlightSearchUrl(flightMeta);
  const resultData = await fetchTravellinkFlightSearchResult(flightMeta, resultUrl);
  if (resultData === undefined) return undefined;

  const candidates = rankTravellinkOfferCandidates(
    dedupeTravellinkOfferCandidates(extractTravellinkOfferCandidates(resultData, flightMeta, resultUrl)),
  );
  const best = candidates[0];
  if (best === undefined) return undefined;

  return {
    source: "travellink",
    sourceName: "Travellink",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: best.shopName,
    price: best.price,
    amount: best.amount,
    sortAmount: best.sortAmount ?? best.amount,
    currency: best.currency,
    productName: routeTitle,
    productUrl: resultUrl,
    offerUrl: best.productUrl,
    alternatives: candidates.map(({ productUrl: _productUrl, durationMinutes: _durationMinutes, meRating: _meRating, ...candidate }) => candidate),
  };
}

async function fetchTravellinkFlightSearchResult(
  flightMeta: FlightSearchMeta,
  resultUrl: string,
): Promise<Record<string, unknown> | undefined> {
  await userscriptTextRequest(TRAVELLINK_HOME_URL, {
    headers: { Accept: "text/html" },
    credentials: "include",
  });

  const locationData = await userscriptJsonRequest(buildTravellinkGeoLocationsUrl(flightMeta), {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const locations = readTravellinkGeoLocations(locationData, flightMeta);
  if (locations === undefined) return undefined;

  await userscriptTextRequest(TRAVELLINK_RECOVER_SEARCH_ENDPOINT, {
    method: "POST",
    headers: TRAVELLINK_COMMON_HEADERS,
    body: JSON.stringify(buildTravellinkRecoverSearchPayload(flightMeta, locations, resultUrl)),
    credentials: "include",
  });

  const resultData = await userscriptJsonRequest(TRAVELLINK_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: TRAVELLINK_COMMON_HEADERS,
    body: JSON.stringify(buildTravellinkSearchGraphqlPayload(flightMeta, locations)),
    credentials: "include",
  });
  return isRecord(resultData) ? resultData : undefined;
}

function buildTravellinkGeoLocationsUrl(flightMeta: FlightSearchMeta): string {
  const iatas = uniqueStrings([flightMeta.origin, flightMeta.destination])
    .map((iata) => `iatas=${encodeURIComponent(iata)}`)
    .join(";");
  return `${TRAVELLINK_BASE_URL}/travel/service/geo/locations;${iatas}`;
}

function readTravellinkGeoLocations(
  value: unknown,
  flightMeta: FlightSearchMeta,
): { origin: TravellinkLocation; destination: TravellinkLocation } | undefined {
  const locations = readRecordArray(value).map(readTravellinkLocation).filter((location): location is TravellinkLocation => location !== undefined);
  const origin = locations.find((location) => location.iata === flightMeta.origin);
  const destination = locations.find((location) => location.iata === flightMeta.destination);
  return origin !== undefined && destination !== undefined ? { origin, destination } : undefined;
}

function readTravellinkLocation(value: Record<string, unknown>): TravellinkLocation | undefined {
  const iata = readIataCodeValue(value.iata);
  const geoNodeId = readNumberValue(value.geoNodeId);
  if (iata === undefined || geoNodeId === undefined) return undefined;

  return {
    iata,
    name: readStringValue(value.name) ?? iata,
    geoNodeId,
    type: readStringValue(value.type) ?? "CITY",
  };
}

function buildTravellinkRecoverSearchPayload(
  flightMeta: FlightSearchMeta,
  locations: { origin: TravellinkLocation; destination: TravellinkLocation },
  resultUrl: string,
): Record<string, unknown> {
  const segmentRequests = [
    buildTravellinkRecoverSegment(flightMeta.outboundDate, locations.origin, locations.destination),
  ];
  if (flightMeta.inboundDate !== undefined) {
    segmentRequests.push(buildTravellinkRecoverSegment(flightMeta.inboundDate, locations.destination, locations.origin));
  }

  return {
    itinerarySearchRequest: {
      type: flightMeta.inboundDate !== undefined ? "ROUND_TRIP" : "ONE_WAY",
      numAdults: flightMeta.adults,
      numChildren: 0,
      numInfants: 0,
      cabinClass: "TOURIST",
      mainAirportsOnly: false,
      directFlightsOnly: false,
      resident: false,
      searchMainProductType: "FLIGHT",
      airlinesCodes: [],
      externalSelectionRequest: {},
      dynpackSearch: false,
      segmentRequests,
      urlSearch: resultUrl,
    },
    extraItinerarySearchRequestList: [],
    buyPath: "FLIGHTS_HOME_SEARCH_FORM",
  };
}

function buildTravellinkRecoverSegment(
  date: string,
  departure: TravellinkLocation,
  destination: TravellinkLocation,
): Record<string, unknown> {
  return {
    dateStr: date,
    date,
    departure: buildTravellinkRecoverLocation(departure),
    destination: buildTravellinkRecoverLocation(destination),
    time: "0000",
    timeWindow: null,
  };
}

function buildTravellinkRecoverLocation(location: TravellinkLocation): Record<string, unknown> {
  return {
    iata: location.iata,
    name: location.name,
    geoNodeId: location.geoNodeId,
    type: location.type,
  };
}

function buildTravellinkSearchGraphqlPayload(
  flightMeta: FlightSearchMeta,
  locations: { origin: TravellinkLocation; destination: TravellinkLocation },
): Record<string, unknown> {
  const segments = [
    buildTravellinkSearchSegment(flightMeta.outboundDate, locations.origin, locations.destination),
  ];
  if (flightMeta.inboundDate !== undefined) {
    segments.push(buildTravellinkSearchSegment(flightMeta.inboundDate, locations.destination, locations.origin));
  }

  return {
    query: TRAVELLINK_SEARCH_QUERY,
    variables: {
      searchItineraryRequest: {
        buyPath: 71,
        tripType: flightMeta.inboundDate !== undefined ? "ROUND_TRIP" : "ONE_WAY",
        unbundledMappingGrouping: "DEFAULT",
        itinerary: {
          numAdults: flightMeta.adults,
          numChildren: 0,
          numInfants: 0,
          cabinClass: "TOURIST",
          externalSelection: null,
          segments,
          excludeCarriers: false,
        },
      },
    },
    operationName: "searchItinerary",
  };
}

function buildTravellinkSearchSegment(
  date: string,
  departure: TravellinkLocation,
  destination: TravellinkLocation,
): Record<string, unknown> {
  return {
    date,
    departure: { iata: departure.iata, geoNodeId: departure.geoNodeId },
    destination: { iata: destination.iata, geoNodeId: destination.geoNodeId },
  };
}

function extractTravellinkOfferCandidates(
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
  resultUrl: string,
): TravellinkFlightOfferCandidate[] {
  const searchData = isRecord(resultData.data) && isRecord(resultData.data.searchItinerary)
    ? resultData.data.searchItinerary
    : undefined;
  if (searchData === undefined) return [];

  const candidates: TravellinkFlightOfferCandidate[] = [];
  for (const itinerary of readRecordArray(searchData.itineraries)) {
    const legs = readTravellinkFlightLegSummaries(itinerary, searchData);
    if (!isTravellinkFlightMatchingSearch(legs, flightMeta)) continue;

    const fee = readTravellinkStandardFee(itinerary);
    if (fee === undefined) continue;

    const platform = formatTravellinkFlightTripSummary(legs);
    const durationMinutes = legs.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0);
    const meRating = readNumberValue(itinerary.meRating);
    candidates.push({
      shopName: "Travellink",
      price: formatFlightPrice(fee.amount, fee.currency),
      amount: fee.amount,
      sortAmount: fee.amount,
      currency: fee.currency,
      productUrl: resultUrl,
      ...(durationMinutes > 0 ? { durationMinutes } : {}),
      ...(meRating !== undefined ? { meRating } : {}),
      ...(platform !== undefined ? { platform } : {}),
    });
  }

  return candidates;
}

function readTravellinkFlightLegSummaries(
  itinerary: Record<string, unknown>,
  searchData: Record<string, unknown>,
): TravellinkFlightLegSummary[] {
  const segmentsById = buildTravellinkRecordMap(readRecordArray(searchData.segments), "segment");
  const sectionsById = buildTravellinkRecordMap(readRecordArray(searchData.sections), "section");
  const locationsById = buildTravellinkRecordMap(readRecordArray(searchData.locations), "location");
  const carriersById = buildTravellinkRecordMap(readRecordArray(searchData.carriers), "carrier");

  return readRecordArray(itinerary.legs)
    .map((leg): TravellinkFlightLegSummary | undefined => {
      const segment = readTravellinkRecordFromMap(segmentsById, leg.segmentId);
      if (segment === undefined) return undefined;

      const sectionIds = Array.isArray(segment.sections) ? segment.sections.filter(isString) : [];
      const sections = sectionIds
        .map((sectionId) => sectionsById[sectionId])
        .filter((section): section is Record<string, unknown> => section !== undefined);
      const firstSection = sections[0];
      const lastSection = sections[sections.length - 1];
      if (firstSection === undefined || lastSection === undefined) return undefined;

      const departure = readTravellinkRecordFromMap(locationsById, firstSection.departureId);
      const destination = readTravellinkRecordFromMap(locationsById, lastSection.destinationId);
      const origin = readIataCodeValue(departure?.iata);
      const destinationIata = readIataCodeValue(destination?.iata);
      if (origin === undefined || destinationIata === undefined) return undefined;

      const carrierNames = uniqueStrings(
        [
          readTravellinkCarrierName(carriersById, segment.carrierId),
          ...sections.map((section) => readTravellinkCarrierName(carriersById, section.carrierId)),
        ].filter((carrier): carrier is string => carrier !== undefined),
      );
      const sectionDurationMinutes = sections.reduce((total, section) => total + (readNumberValue(section.duration) ?? 0), 0);
      const durationMinutes = readNumberValue(segment.duration) ?? (sectionDurationMinutes > 0 ? sectionDurationMinutes : undefined);
      const departureTime = readStringValue(firstSection.departureDate);
      const arrivalTime = readStringValue(lastSection.arrivalDate);

      return {
        origin,
        destination: destinationIata,
        ...(departureTime !== undefined ? { departureDate: departureTime.slice(0, 10), departureTime } : {}),
        ...(arrivalTime !== undefined ? { arrivalTime } : {}),
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        stopCount: Math.max(0, sections.length - 1),
        carrierNames,
      };
    })
    .filter((summary): summary is TravellinkFlightLegSummary => summary !== undefined);
}

function buildTravellinkRecordMap(
  items: Array<Record<string, unknown>>,
  valueKey: string,
): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const item of items) {
    const id = readStringValue(item.id);
    const value = isRecord(item[valueKey]) ? item[valueKey] : undefined;
    if (id !== undefined && value !== undefined) map[id] = value;
  }
  return map;
}

function readTravellinkRecordFromMap(
  map: Record<string, Record<string, unknown>>,
  idValue: unknown,
): Record<string, unknown> | undefined {
  const id = readStringValue(idValue);
  return id !== undefined ? map[id] : undefined;
}

function readTravellinkCarrierName(
  carriersById: Record<string, Record<string, unknown>>,
  carrierIdValue: unknown,
): string | undefined {
  const carrierId = readStringValue(carrierIdValue);
  if (carrierId === undefined) return undefined;

  const carrier = carriersById[carrierId];
  return readStringValue(carrier?.name) ?? carrierId;
}

function isTravellinkFlightMatchingSearch(
  legs: TravellinkFlightLegSummary[],
  flightMeta: FlightSearchMeta,
): boolean {
  const outboundLeg = legs[0];
  if (
    outboundLeg === undefined ||
    !isTravellinkFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, flightMeta.outboundDate)
  ) {
    return false;
  }

  if (flightMeta.inboundDate === undefined) return true;

  const inboundLeg = legs[1];
  return inboundLeg !== undefined &&
    isTravellinkFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, flightMeta.inboundDate);
}

function isTravellinkFlightLegMatch(
  leg: TravellinkFlightLegSummary,
  origin: string,
  destination: string,
  date: string,
): boolean {
  return leg.origin === origin &&
    leg.destination === destination &&
    leg.departureDate === date;
}

function readTravellinkStandardFee(
  itinerary: Record<string, unknown>,
): { amount: number; currency: string } | undefined {
  const fees = readRecordArray(itinerary.fees)
    .map((fee) => {
      const price = isRecord(fee.price) ? fee.price : undefined;
      const amount = readPositiveNumberValue(price?.amount);
      if (amount === undefined) return undefined;
      return {
        amount,
        currency: readStringValue(price?.currency) ?? "NOK",
        type: readStringValue(fee.type) ?? "",
      };
    })
    .filter((fee): fee is { amount: number; currency: string; type: string } => fee !== undefined);
  if (fees.length === 0) return undefined;

  return fees.find((fee) => /UNDISCOUNTED|WITHOUT[_\s-]?DISCOUNT|NON[_\s-]?MEMBER/i.test(fee.type)) ??
    fees.find((fee) => !/DISCOUNTED|MEMBER|PRIME|SUBSCRIPTION/i.test(fee.type)) ??
    [...fees].sort((left, right) => right.amount - left.amount)[0];
}

function dedupeTravellinkOfferCandidates(
  candidates: TravellinkFlightOfferCandidate[],
): TravellinkFlightOfferCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidates: TravellinkFlightOfferCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      Math.round(candidate.amount),
      candidate.platform ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }
  return uniqueCandidates;
}

function rankTravellinkOfferCandidates(
  candidates: TravellinkFlightOfferCandidate[],
): TravellinkFlightOfferCandidate[] {
  const shortestDuration = candidates.reduce<number | undefined>((shortest, candidate) => {
    if (candidate.durationMinutes === undefined) return shortest;
    return shortest === undefined ? candidate.durationMinutes : Math.min(shortest, candidate.durationMinutes);
  }, undefined);
  const maxReasonableDuration = calculateMaxReasonableFlightDuration(shortestDuration);

  return [...candidates].sort((left, right) => {
    const leftReasonable = isReasonableTravellinkDuration(left, maxReasonableDuration);
    const rightReasonable = isReasonableTravellinkDuration(right, maxReasonableDuration);
    if (leftReasonable !== rightReasonable) return leftReasonable ? -1 : 1;

    const amountDiff = (left.sortAmount ?? left.amount) - (right.sortAmount ?? right.amount);
    if (amountDiff !== 0) return amountDiff;

    const ratingDiff = (right.meRating ?? Number.NEGATIVE_INFINITY) - (left.meRating ?? Number.NEGATIVE_INFINITY);
    if (ratingDiff !== 0) return ratingDiff;

    return (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.durationMinutes ?? Number.MAX_SAFE_INTEGER);
  });
}

function isReasonableTravellinkDuration(
  candidate: TravellinkFlightOfferCandidate,
  maxReasonableDuration: number | undefined,
): boolean {
  if (maxReasonableDuration === undefined || candidate.durationMinutes === undefined) return true;
  return candidate.durationMinutes <= maxReasonableDuration;
}

function formatTravellinkFlightTripSummary(legs: TravellinkFlightLegSummary[]): string | undefined {
  const carrierNames = uniqueStrings(legs.flatMap((leg) => leg.carrierNames));
  const parts = [
    carrierNames.join("/"),
    formatTravellinkFlightStops(legs),
    formatTravellinkFlightTimeSummary(legs),
    formatTravellinkFlightDurationSummary(legs),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatTravellinkFlightStops(legs: TravellinkFlightLegSummary[]): string | undefined {
  if (legs.length === 0) return undefined;
  if (legs.every((leg) => leg.stopCount === 0)) return "direkte";
  return legs.map((leg) => leg.stopCount === 0 ? "direkte" : `${leg.stopCount} stopp`).join(" / ");
}

function formatTravellinkFlightTimeSummary(legs: TravellinkFlightLegSummary[]): string | undefined {
  const ranges = legs
    .map((leg) => {
      const departureClock = formatMomondoFlightClock(leg.departureTime);
      const arrivalClock = formatMomondoFlightClock(leg.arrivalTime);
      return departureClock !== undefined && arrivalClock !== undefined
        ? `${departureClock}-${arrivalClock}`
        : undefined;
    })
    .filter((range): range is string => range !== undefined);
  return ranges.length > 0 ? ranges.join(" / ") : undefined;
}

function formatTravellinkFlightDurationSummary(legs: TravellinkFlightLegSummary[]): string | undefined {
  const durations = legs
    .map((leg) => formatPanFlightsDuration(leg.durationMinutes))
    .filter((duration): duration is string => duration !== undefined);
  return durations.length > 0 ? durations.join(" / ") : undefined;
}

function buildTripComFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const params = new URLSearchParams({
    dcity: flightMeta.origin.toLowerCase(),
    acity: flightMeta.destination.toLowerCase(),
    ddate: flightMeta.outboundDate,
    triptype: flightMeta.inboundDate !== undefined ? "rt" : "ow",
    class: "y",
    lowpricesource: "searchform",
    quantity: String(flightMeta.adults),
    searchboxarg: "t",
    nonstoponly: "off",
    locale: "en-US",
    curr: TRIP_COM_DEFAULT_CURRENCY,
  });
  if (flightMeta.inboundDate !== undefined) params.set("rdate", flightMeta.inboundDate);
  return `${TRIP_COM_BASE_URL}/flights/showfarefirst?${params.toString()}`;
}

async function findTripComFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  if (flightMeta.inboundDate === undefined) return undefined;

  const resultUrl = buildTripComFlightSearchUrl(flightMeta);
  const resultData = await userscriptJsonRequest(TRIP_COM_LOW_PRICE_ENDPOINT, {
    method: "POST",
    headers: TRIP_COM_COMMON_HEADERS,
    body: JSON.stringify(buildTripComLowPricePayload(flightMeta)),
    credentials: "omit",
  });
  if (!isRecord(resultData)) return undefined;

  const candidate = extractTripComCalendarCandidate(resultData, flightMeta, resultUrl);
  if (candidate === undefined) return undefined;

  return {
    source: "tripcom",
    sourceName: "Trip.com",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: candidate.shopName,
    price: candidate.price,
    amount: candidate.amount,
    sortAmount: candidate.sortAmount ?? candidate.amount,
    currency: candidate.currency,
    productName: routeTitle,
    productUrl: resultUrl,
    offerUrl: candidate.productUrl,
    alternatives: [candidate].map(({ productUrl: _productUrl, ...alternative }) => alternative),
  };
}

function buildTripComLowPricePayload(flightMeta: FlightSearchMeta): Record<string, unknown> {
  return {
    dCity: flightMeta.origin,
    aCity: flightMeta.destination,
    dDate: flightMeta.outboundDate,
    flightWayType: flightMeta.inboundDate !== undefined ? "RT" : "OW",
    departureAirport: flightMeta.origin,
    arrivalAirport: flightMeta.destination,
    cabinClass: "Economy",
    transferType: "ANY",
    searchInfo: {
      travelerNum: {
        adult: flightMeta.adults,
        child: 0,
        infant: 0,
      },
    },
    abtList: [],
    offSet: 30,
    ...(flightMeta.inboundDate !== undefined ? { aDate: flightMeta.inboundDate, startInterval: 30, endInterval: 30 } : {}),
    Head: {
      Group: "Trip",
      Source: "ONLINE",
      Version: "3",
      Currency: TRIP_COM_DEFAULT_CURRENCY,
      Locale: "en-US",
      Language: "en",
      ClientID: "",
      PageId: "10320667452",
    },
  };
}

function extractTripComCalendarCandidate(
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
  resultUrl: string,
): TripComFlightOfferCandidate | undefined {
  const currency = readStringValue(resultData.currency) ?? TRIP_COM_DEFAULT_CURRENCY;
  const calendarItem = readRecordArray(resultData.lowPriceInCalenderDtoInfoList)
    .find((item) => isTripComCalendarItemMatchingSearch(item, flightMeta));
  const amount = readPositiveNumberValue(calendarItem?.currencyPrice);
  if (amount === undefined) return undefined;

  const estimatedNokAmount = estimateTripComNokAmount(amount, currency);
  const isEstimatedCurrency = estimatedNokAmount !== undefined && currency.toUpperCase() !== "NOK";
  const displayAmount = estimatedNokAmount ?? amount;
  const displayCurrency = estimatedNokAmount !== undefined ? "NOK" : currency;

  return {
    shopName: "Trip.com kalender",
    price: isEstimatedCurrency ? formatApproxNokFlightPrice(displayAmount) : formatFlightPrice(displayAmount, displayCurrency),
    amount: displayAmount,
    sortAmount: estimatedNokAmount ?? estimateTripComSortAmount(amount, currency),
    currency: displayCurrency,
    productUrl: resultUrl,
    platform: [
      "indikativ kalenderpris",
      isEstimatedCurrency ? `Trip.com viser ${formatFlightPrice(amount, currency)}` : undefined,
      flightMeta.inboundDate !== undefined ? "tur/retur" : "én vei",
      "samme flyplasser",
    ].filter((part) => part !== undefined).join(", "),
  };
}

function isTripComCalendarItemMatchingSearch(
  item: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
): boolean {
  if (formatPanFlightsEpochDate(readNumberValue(item.dDate)) !== flightMeta.outboundDate) return false;
  if (flightMeta.inboundDate === undefined) return true;
  return formatPanFlightsEpochDate(readNumberValue(item.aDate)) === flightMeta.inboundDate;
}

function estimateTripComSortAmount(amount: number, currency: string): number {
  return estimateTripComNokAmount(amount, currency) ?? FLIGHT_STATIC_PRICE_SORT_AMOUNT;
}

function estimateTripComNokAmount(amount: number, currency: string): number | undefined {
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "NOK") return amount;
  if (normalizedCurrency === "USD") return Math.round(amount * TRIP_COM_USD_TO_NOK_SORT_RATE);
  return undefined;
}

async function findSkyscannerFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  const resultUrl = buildSkyscannerFlightSearchUrl(flightMeta);
  const pageCandidates = extractCurrentSkyscannerPageOfferCandidates(flightMeta);
  const calendarCandidate = pageCandidates.length === 0
    ? await fetchSkyscannerFlightCalendarCandidate(flightMeta, resultUrl)
    : undefined;
  const candidates = pageCandidates.length > 0
    ? pageCandidates
    : calendarCandidate !== undefined
      ? [calendarCandidate]
      : [];
  const candidate = candidates[0];
  if (candidate === undefined) return undefined;

  return {
    source: "skyscanner",
    sourceName: "Skyscanner",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: candidate.shopName,
    price: candidate.price,
    amount: candidate.amount,
    sortAmount: candidate.sortAmount ?? candidate.amount,
    currency: candidate.currency,
    productName: routeTitle,
    productUrl: candidate.productUrl,
    offerUrl: candidate.productUrl,
    alternatives: candidates.map(({ productUrl: _productUrl, ...alternative }) => alternative),
  };
}

function extractCurrentSkyscannerPageOfferCandidates(flightMeta: FlightSearchMeta): SkyscannerFlightOfferCandidate[] {
  if (!isCurrentSkyscannerFlightSearchPageForMeta(flightMeta)) return [];
  return extractSkyscannerVisibleOfferCandidates(window.location.href);
}

function isCurrentSkyscannerFlightSearchPageForMeta(flightMeta: FlightSearchMeta): boolean {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined || !isSkyscannerFlightSearchPage(parsedUrl)) return false;

  const currentMeta = extractSkyscannerFlightSearchMeta(parsedUrl);
  return currentMeta !== undefined && buildFlightSearchMetaKey(currentMeta) === buildFlightSearchMetaKey(flightMeta);
}

function readCurrentSkyscannerVisiblePriceKey(): string {
  return extractSkyscannerVisibleOfferCandidates(window.location.href)
    .slice(0, 5)
    .map((candidate) => `${Math.round(candidate.amount)}:${candidate.platform ?? ""}`)
    .join(";");
}

function extractSkyscannerVisibleOfferCandidates(productUrl: string): SkyscannerFlightOfferCandidate[] {
  const text = (document.body?.innerText ?? "").replace(/\u00a0/g, " ");
  const candidates = [
    ...extractSkyscannerVisibleOfferCandidatesFromPattern(text, /(\d+)\s+tilbud\s+fra\s+(\d[\d\s]*)\s*kr\b/gi, productUrl),
  ];

  if (candidates.length === 0) {
    candidates.push(...extractSkyscannerFallbackVisibleOfferCandidates(text, productUrl));
  }

  return dedupeSkyscannerOfferCandidates(candidates).sort((left, right) => left.amount - right.amount);
}

function extractSkyscannerVisibleOfferCandidatesFromPattern(
  text: string,
  pattern: RegExp,
  productUrl: string,
): SkyscannerFlightOfferCandidate[] {
  const candidates: SkyscannerFlightOfferCandidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const offerCount = readPositiveIntegerValue(match[1]);
    const amount = readPositiveNumberValue(match[2]);
    if (amount === undefined) continue;

    candidates.push({
      shopName: "Skyscanner",
      price: formatNokFlightPrice(amount),
      amount,
      sortAmount: amount,
      currency: "NOK",
      productUrl,
      platform: [
        "synlig treffliste",
        offerCount !== undefined ? `${offerCount} tilbud` : undefined,
      ].filter((part): part is string => part !== undefined).join(", "),
    });
  }
  return candidates;
}

function extractSkyscannerFallbackVisibleOfferCandidates(text: string, productUrl: string): SkyscannerFlightOfferCandidate[] {
  const candidates: SkyscannerFlightOfferCandidate[] = [];
  const pattern = /\b(\d[\d\s]{0,8})\s*kr\b/gi;
  for (const match of text.matchAll(pattern)) {
    const amount = readPositiveNumberValue(match[1]);
    if (amount === undefined) continue;

    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 160), Math.min(text.length, index + 160));
    if (!/\b(?:tilbud|se mer|vis tilbud|detaljer)\b/i.test(context)) continue;

    candidates.push({
      shopName: "Skyscanner",
      price: formatNokFlightPrice(amount),
      amount,
      sortAmount: amount,
      currency: "NOK",
      productUrl,
      platform: "synlig treffliste",
    });
  }
  return candidates;
}

function dedupeSkyscannerOfferCandidates(candidates: SkyscannerFlightOfferCandidate[]): SkyscannerFlightOfferCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidates: SkyscannerFlightOfferCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.amount)}|${candidate.platform ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }
  return uniqueCandidates;
}

async function fetchSkyscannerFlightCalendarCandidate(
  flightMeta: FlightSearchMeta,
  resultUrl: string,
): Promise<SkyscannerFlightOfferCandidate | undefined> {
  const [originEntityId, destinationEntityId] = await Promise.all([
    fetchSkyscannerPlaceEntityId(flightMeta.origin, "inputorigin"),
    fetchSkyscannerPlaceEntityId(flightMeta.destination, "inputdestination"),
  ]);
  if (originEntityId === undefined || destinationEntityId === undefined) return undefined;

  return await fetchSkyscannerCalendarCandidate(flightMeta, resultUrl, originEntityId, destinationEntityId, true) ??
    fetchSkyscannerCalendarCandidate(flightMeta, resultUrl, originEntityId, destinationEntityId, false);
}

async function fetchSkyscannerPlaceEntityId(
  iataCode: string,
  endpoint: "inputorigin" | "inputdestination",
): Promise<string | undefined> {
  const params = new URLSearchParams({ query: iataCode, placeTypes: "AIRPORT" });
  const value = await userscriptJsonRequest(`${SKYSCANNER_FENRYR_BASE_URL}/${endpoint}?${params.toString()}`, {
    headers: SKYSCANNER_HTTP_HEADERS,
    credentials: "omit",
  });
  return isRecord(value) ? readSkyscannerPlaceEntityId(value, iataCode) : undefined;
}

function readSkyscannerPlaceEntityId(value: Record<string, unknown>, iataCode: string): string | undefined {
  let fallbackEntityId: string | undefined;
  for (const suggestion of readRecordArray(value.inputSuggest)) {
    const navigation = isRecord(suggestion.navigation) ? suggestion.navigation : undefined;
    const flightParams = isRecord(navigation?.relevantFlightParams) ? navigation.relevantFlightParams : undefined;
    const entityId = readStringValue(flightParams?.entityId) ?? readStringValue(navigation?.entityId);
    const skyId = readStringValue(flightParams?.skyId)?.toUpperCase();
    if (entityId !== undefined && fallbackEntityId === undefined) fallbackEntityId = entityId;
    if (entityId !== undefined && skyId === iataCode.toUpperCase()) return entityId;
  }
  return fallbackEntityId;
}

async function fetchSkyscannerCalendarCandidate(
  flightMeta: FlightSearchMeta,
  resultUrl: string,
  originEntityId: string,
  destinationEntityId: string,
  isDirect: boolean,
): Promise<SkyscannerFlightOfferCandidate | undefined> {
  const pickDate = flightMeta.inboundDate ?? flightMeta.outboundDate;
  const value = await userscriptJsonRequest(`${SKYSCANNER_FENRYR_BASE_URL}/pricecalendar/explore`, {
    method: "POST",
    headers: {
      ...SKYSCANNER_HTTP_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      headers: SKYSCANNER_CALENDAR_HEADERS,
      originId: originEntityId,
      destinationId: destinationEntityId,
      calendarStartDate: buildSkyscannerCalendarStartDate(flightMeta),
      isDirect,
      tripType: flightMeta.inboundDate !== undefined ? "TRIP_TYPE_RETURN" : "TRIP_TYPE_ONEWAY",
      isFixedDeparture: flightMeta.inboundDate !== undefined,
    }),
    credentials: "omit",
  });
  if (!isRecord(value)) return undefined;

  const day = readRecordArray(value.days).find((candidateDay) => readStringValue(candidateDay.day) === pickDate);
  const flightPrice = isRecord(day?.flightPrice) ? day.flightPrice : undefined;
  const money = readSkyscannerMoney(flightPrice);
  if (money === undefined) return undefined;

  return {
    shopName: "Skyscanner kalender",
    price: formatFlightPrice(money.amount, money.currency),
    amount: money.amount,
    sortAmount: money.amount,
    currency: money.currency,
    productUrl: resultUrl,
    platform: [
      "indikativ kalenderpris",
      isDirect ? "direkte reiser" : "alle reiser",
      flightMeta.inboundDate !== undefined ? "tur/retur" : "én vei",
    ].join(", "),
  };
}

function buildSkyscannerCalendarStartDate(flightMeta: FlightSearchMeta): string {
  return flightMeta.inboundDate !== undefined
    ? flightMeta.outboundDate
    : `${flightMeta.outboundDate.slice(0, 8)}01`;
}

function readSkyscannerMoney(value: Record<string, unknown> | undefined): { amount: number; currency: string } | undefined {
  if (value === undefined) return undefined;
  const rawAmount = readPositiveNumberValue(value.amount);
  if (rawAmount === undefined) return undefined;

  const currency = readStringValue(value.currencyCode) ?? "NOK";
  const unit = readStringValue(value.unit);
  const amount = unit === "UNIT_CENTI"
    ? rawAmount / 100
    : unit === "UNIT_MILLI"
      ? rawAmount / 1000
      : unit === "UNIT_MICRO"
        ? rawAmount / 1000000
        : rawAmount;
  return amount > 0 ? { amount, currency } : undefined;
}

function buildMomondoFlightSearchUrl(flightMeta: FlightSearchMeta): string {
  const pathParts = [
    `${flightMeta.origin}-${flightMeta.destination}`,
    flightMeta.outboundDate,
    flightMeta.inboundDate,
  ].filter((part): part is string => part !== undefined);
  const params = new URLSearchParams({ sort: MOMONDO_DEFAULT_FLIGHT_SORT_MODE });
  if (flightMeta.adults !== 1) {
    params.set("adults", String(flightMeta.adults));
  }
  return `https://www.momondo.no/flight-search/${pathParts.map(encodeURIComponent).join("/")}?${params.toString()}`;
}

function readCurrentMomondoFlightSearchUrl(flightMeta: FlightSearchMeta): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) return undefined;

  const currentMeta = extractMomondoFlightSearchMeta(parsedUrl);
  return currentMeta !== undefined && isSameFlightSearchMeta(currentMeta, flightMeta)
    ? parsedUrl.toString()
    : undefined;
}

function isSameFlightSearchMeta(left: FlightSearchMeta, right: FlightSearchMeta): boolean {
  return left.origin === right.origin &&
    left.destination === right.destination &&
    left.outboundDate === right.outboundDate &&
    left.inboundDate === right.inboundDate &&
    left.adults === right.adults &&
    left.youths === right.youths &&
    left.children === right.children &&
    left.infants === right.infants;
}

function readMomondoFlightSortMode(url: string): MomondoFlightSortMode | undefined {
  const sortMode = parseUrl(url)?.searchParams.get("sort");
  return sortMode === "price_a" || sortMode === "bestflight_a" ? sortMode : undefined;
}

async function findMomondoFlightPriceMatchOffer(
  flightMeta: FlightSearchMeta,
  routeTitle: string,
  searchDetails: string,
): Promise<PriceMatchOffer | undefined> {
  const resultUrl = readCurrentMomondoFlightSearchUrl(flightMeta) ?? buildMomondoFlightSearchUrl(flightMeta);
  const searchData = await fetchMomondoFlightSearchData(resultUrl);
  if (searchData === undefined) return undefined;

  const resultData = await pollMomondoFlightResults(searchData, flightMeta);
  if (resultData === undefined) return undefined;

  const candidates = extractMomondoFlightOfferCandidates(resultData, flightMeta, searchData.resultUrl);
  const best = candidates[0];
  if (best === undefined) return undefined;

  return {
    source: "momondo",
    sourceName: "momondo",
    details: searchDetails,
    matchedExactProduct: true,
    shopName: best.shopName,
    price: best.price,
    amount: best.amount,
    sortAmount: best.sortAmount ?? best.amount,
    currency: best.currency,
    productName: routeTitle,
    productUrl: searchData.resultUrl,
    offerUrl: best.productUrl,
    alternatives: candidates.map(({ productUrl: _productUrl, ...candidate }) => candidate),
  };
}

async function fetchMomondoFlightSearchData(resultUrl: string): Promise<MomondoFlightSearchData | undefined> {
  const html = await userscriptTextRequest(resultUrl, {
    headers: { Accept: "text/html" },
    credentials: "include",
  });
  if (html === undefined) return undefined;

  const formToken = parseMomondoFormToken(html);
  if (formToken === undefined) return undefined;

  return {
    formToken,
    resultUrl,
    sortMode: readMomondoFlightSortMode(resultUrl) ?? MOMONDO_DEFAULT_FLIGHT_SORT_MODE,
  };
}

function parseMomondoFormToken(html: string): string | undefined {
  return html.match(/window\.R9\.formToken\s*=\s*'([^']+)'/)?.[1] ??
    html.match(/window\.R9\.formToken\s*=\s*"([^"]+)"/)?.[1];
}

async function pollMomondoFlightResults(
  searchData: MomondoFlightSearchData,
  flightMeta: FlightSearchMeta,
): Promise<Record<string, unknown> | undefined> {
  let latestResult: Record<string, unknown> | undefined;
  let searchId: string | undefined;
  let filterState: string | undefined;

  for (let attempt = 0; attempt < MOMONDO_FLIGHT_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(MOMONDO_FLIGHT_POLL_INTERVAL_MS);

    const requestFilterState = filterState;
    const value = await requestMomondoFlightPoll(searchData, flightMeta, searchId, requestFilterState);
    if (!isRecord(value) || !Array.isArray(value.results)) continue;

    latestResult = value;
    searchId = readStringValue(value.searchId) ?? searchId;

    const candidates = extractMomondoFlightOfferCandidates(value, flightMeta, searchData.resultUrl);
    const nextFilterState = filterState ?? buildMomondoExactAirportFilterState(value, flightMeta);
    if (requestFilterState === undefined && nextFilterState !== undefined) {
      filterState = nextFilterState;
      continue;
    }

    const status = readStringValue(value.status);
    if (status === "complete" || (candidates.length > 0 && (value.isTopResultsRankingStable === true || attempt > 0))) {
      return value;
    }
  }

  return latestResult;
}

function requestMomondoFlightPoll(
  searchData: MomondoFlightSearchData,
  flightMeta: FlightSearchMeta,
  searchId: string | undefined,
  filterState: string | undefined,
): Promise<unknown | undefined> {
  return userscriptJsonRequest(MOMONDO_FLIGHT_POLL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF": searchData.formToken,
      "x-kayak-session-error-check": "iris",
    },
    body: JSON.stringify(buildMomondoFlightPollPayload(flightMeta, searchId, filterState, searchData.sortMode)),
    credentials: "include",
  });
}

function buildMomondoFlightPollPayload(
  flightMeta: FlightSearchMeta,
  searchId: string | undefined,
  filterState: string | undefined,
  sortMode: MomondoFlightSortMode,
): Record<string, unknown> {
  return {
    ...(filterState !== undefined ? { filterParams: { fs: filterState } } : {}),
    userSearchParams: {
      ...(searchId !== undefined ? { searchId } : {}),
      legs: buildMomondoFlightRequestLegs(flightMeta),
      passengers: Array.from({ length: flightMeta.adults }, () => "ADT"),
      pageType: "frontDoor",
      sortMode,
    },
    searchMetaData: {
      priceMode: "total",
      searchTypes: [],
      pageNumber: 1,
      pageSize: MOMONDO_FLIGHT_PAGE_SIZE,
    },
  };
}

function buildMomondoExactAirportFilterState(
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
): string | undefined {
  const allowedAirports = new Set([flightMeta.origin, flightMeta.destination]);
  const excludedAirports = [...collectMomondoAirportFilterCodes(resultData)]
    .filter((airport) => !allowedAirports.has(airport))
    .sort();
  return excludedAirports.length > 0 ? `airports=-${excludedAirports.join(",")}` : undefined;
}

function collectMomondoAirportFilterCodes(resultData: Record<string, unknown>): Set<string> {
  const codes = new Set<string>();
  const filterData = isRecord(resultData.filterData) ? resultData.filterData : undefined;
  const airportsFilter = isRecord(filterData?.airports) ? filterData.airports : undefined;
  collectMomondoAirportFilterCodesFromNode(airportsFilter, codes);
  return codes;
}

function collectMomondoAirportFilterCodesFromNode(value: unknown, codes: Set<string>): void {
  if (!isRecord(value)) return;

  const code = readIataCodeValue(value.id);
  if (code !== undefined) codes.add(code);

  const nestedFilterData = isRecord(value.filterData) ? value.filterData : undefined;
  collectMomondoAirportFilterCodesFromNode(nestedFilterData, codes);
  for (const child of readRecordArray(value.items)) {
    collectMomondoAirportFilterCodesFromNode(child, codes);
  }
  for (const child of readRecordArray(value.filterGroups)) {
    collectMomondoAirportFilterCodesFromNode(child, codes);
  }
}

function buildMomondoFlightRequestLegs(flightMeta: FlightSearchMeta): Array<Record<string, unknown>> {
  const legs = [
    buildMomondoFlightRequestLeg(flightMeta.origin, flightMeta.destination, flightMeta.outboundDate),
  ];
  if (flightMeta.inboundDate !== undefined) {
    legs.push(buildMomondoFlightRequestLeg(flightMeta.destination, flightMeta.origin, flightMeta.inboundDate));
  }
  return legs;
}

function buildMomondoFlightRequestLeg(origin: string, destination: string, date: string): Record<string, unknown> {
  return {
    origin: { locationType: "airports", airports: [origin] },
    destination: { locationType: "airports", airports: [destination] },
    date,
    flex: "exact",
    cabinClass: "economy",
  };
}

function extractMomondoFlightOfferCandidates(
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
  fallbackUrl: string,
): MomondoFlightOfferCandidate[] {
  const candidates: MomondoFlightOfferCandidate[] = [];

  for (const result of readRecordArray(resultData.results)) {
    if (!isMomondoFlightMatchingSearch(result, resultData, flightMeta)) continue;
    if (isMomondoFlightPoorItinerary(result)) continue;

    const tripSummary = formatMomondoFlightTripSummary(result, resultData);
    const productUrl = readMomondoResultUrl(result.shareableUrl, fallbackUrl);
    const bookingOptions = readRecordArray(result.bookingOptions).filter(isMomondoBookingOptionAvailable);
    const useDisplayPrices = bookingOptions.some((bookingOption) => {
      return readMomondoBookingOptionDisplayAmount(bookingOption) !== undefined;
    });

    for (const bookingOption of bookingOptions) {
      const amount = useDisplayPrices
        ? readMomondoBookingOptionDisplayAmount(bookingOption)
        : readMomondoBookingOptionAmount(bookingOption);
      if (amount === undefined) continue;

      const currency = (
        useDisplayPrices
          ? readMomondoBookingOptionDisplayCurrency(bookingOption)
          : readMomondoBookingOptionCurrency(bookingOption)
      ) ?? "NOK";
      const luggageSummary = formatMomondoFlightLuggageSummary(bookingOption);
      const platform = [tripSummary, luggageSummary]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join(", ");

      candidates.push({
        shopName: readMomondoProviderName(bookingOption, resultData) ?? "momondo",
        price: formatFlightPrice(amount, currency),
        amount,
        sortAmount: amount,
        currency,
        productUrl,
        ...(platform.length > 0 ? { platform } : {}),
      });
    }
  }

  return dedupeMomondoFlightOfferCandidates(candidates);
}

function isMomondoFlightPoorItinerary(result: Record<string, unknown>): boolean {
  if (readStringValue(result.type)?.toLowerCase() === "fsr") return true;
  if (result.hasHackerFares === true) return true;

  return readRecordArray(result.legs).some((leg) => {
    return readRecordArray(leg.segments).some((segmentRef) => segmentRef.hasSelfTransfer === true);
  });
}

function dedupeMomondoFlightOfferCandidates(candidates: MomondoFlightOfferCandidate[]): MomondoFlightOfferCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidates: MomondoFlightOfferCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.shopName,
      Math.round(candidate.amount),
      candidate.platform ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }
  return uniqueCandidates;
}

function isMomondoBookingOptionAvailable(bookingOption: Record<string, unknown>): boolean {
  if (
    bookingOption.hidden === true ||
    bookingOption.isHidden === true ||
    bookingOption.disabled === true ||
    bookingOption.isDisabled === true ||
    bookingOption.unavailable === true ||
    bookingOption.isUnavailable === true ||
    bookingOption.available === false ||
    bookingOption.isAvailable === false ||
    bookingOption.visible === false ||
    bookingOption.isVisible === false
  ) {
    return false;
  }

  return [
    bookingOption.status,
    bookingOption.state,
    bookingOption.bookingState,
    bookingOption.availabilityStatus,
    bookingOption.displayStatus,
  ].every((value) => {
    const normalized = readStringValue(value)?.toLowerCase();
    return normalized === undefined || !/unavailable|hidden|expired|sold[_\s-]?out|stale|invalid|failed|removed/.test(normalized);
  });
}

function readMomondoBookingOptionDisplayAmount(bookingOption: Record<string, unknown>): number | undefined {
  const displayPrice = isRecord(bookingOption.displayPrice) ? bookingOption.displayPrice : undefined;
  return readPositiveNumberValue(displayPrice?.price);
}

function readMomondoBookingOptionDisplayCurrency(bookingOption: Record<string, unknown>): string | undefined {
  const displayPrice = isRecord(bookingOption.displayPrice) ? bookingOption.displayPrice : undefined;
  return readStringValue(displayPrice?.currency);
}

function readMomondoBookingOptionAmount(bookingOption: Record<string, unknown>): number | undefined {
  const fees = isRecord(bookingOption.fees) ? bookingOption.fees : undefined;
  const totalPrice = isRecord(fees?.totalPrice) ? fees.totalPrice : undefined;
  return readMomondoBookingOptionDisplayAmount(bookingOption) ??
    readPositiveNumberValue(totalPrice?.price) ??
    readPositiveNumberValue(bookingOption.price);
}

function readMomondoBookingOptionCurrency(bookingOption: Record<string, unknown>): string | undefined {
  const fees = isRecord(bookingOption.fees) ? bookingOption.fees : undefined;
  const totalPrice = isRecord(fees?.totalPrice) ? fees.totalPrice : undefined;
  return readMomondoBookingOptionDisplayCurrency(bookingOption) ??
    readStringValue(totalPrice?.currency) ??
    readStringValue(bookingOption.currency);
}

function readMomondoProviderName(
  bookingOption: Record<string, unknown>,
  resultData: Record<string, unknown>,
): string | undefined {
  const providerCode = readStringValue(bookingOption.providerCode);
  const providers = isRecord(resultData.providers) ? resultData.providers : undefined;
  const provider = providerCode !== undefined && isRecord(providers?.[providerCode])
    ? providers[providerCode]
    : undefined;
  return readStringValue(provider?.displayName) ??
    readStringValue(bookingOption.providerName) ??
    providerCode;
}

function readMomondoResultUrl(value: unknown, fallbackUrl: string): string {
  const url = readStringValue(value);
  if (url === undefined) return fallbackUrl;
  return parseUrlWithBase(url, "https://www.momondo.no/")?.toString() ?? fallbackUrl;
}

function isMomondoFlightMatchingSearch(
  result: Record<string, unknown>,
  resultData: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
): boolean {
  const legs = readMomondoFlightLegSummaries(result, resultData);
  const outboundLeg = legs[0];
  if (
    outboundLeg === undefined ||
    !isMomondoFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, flightMeta.outboundDate)
  ) {
    return false;
  }

  if (flightMeta.inboundDate === undefined) return true;

  const inboundLeg = legs[1];
  return inboundLeg !== undefined &&
    isMomondoFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, flightMeta.inboundDate);
}

function isMomondoFlightLegMatch(
  leg: MomondoFlightLegSummary,
  origin: string,
  destination: string,
  date: string,
): boolean {
  return leg.origin === origin &&
    leg.destination === destination &&
    leg.departureDate === date;
}

function readMomondoFlightLegSummaries(
  result: Record<string, unknown>,
  resultData: Record<string, unknown>,
): MomondoFlightLegSummary[] {
  const segmentsById = isRecord(resultData.segments) ? resultData.segments : {};

  return readRecordArray(result.legs)
    .map((leg): MomondoFlightLegSummary | undefined => {
      const segments = readRecordArray(leg.segments)
        .map((segmentRef) => readStringValue(segmentRef.id))
        .map((segmentId) => segmentId !== undefined && isRecord(segmentsById[segmentId]) ? segmentsById[segmentId] : undefined)
        .filter((segment): segment is Record<string, unknown> => segment !== undefined);
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const origin = readStringValue(firstSegment?.origin)?.toUpperCase();
      const destination = readStringValue(lastSegment?.destination)?.toUpperCase();
      if (origin === undefined || destination === undefined) return undefined;

      const durationMinutes = segments.reduce((total, segment) => total + (readNumberValue(segment.duration) ?? 0), 0);
      const departureDate = readStringValue(firstSegment?.departure)?.slice(0, 10);
      const departureTime = readStringValue(firstSegment?.departure);
      const arrivalTime = readStringValue(lastSegment?.arrival);
      return {
        origin,
        destination,
        ...(departureDate !== undefined ? { departureDate } : {}),
        ...(departureTime !== undefined ? { departureTime } : {}),
        ...(arrivalTime !== undefined ? { arrivalTime } : {}),
        ...(durationMinutes > 0 ? { durationMinutes } : {}),
        stopCount: Math.max(0, segments.length - 1),
        carrierCodes: segments
          .map((segment) => readStringValue(segment.airline)?.toUpperCase())
          .filter((carrier): carrier is string => carrier !== undefined),
      };
    })
    .filter((summary): summary is MomondoFlightLegSummary => summary !== undefined);
}

function formatMomondoFlightTripSummary(
  result: Record<string, unknown>,
  resultData: Record<string, unknown>,
): string | undefined {
  const legs = readMomondoFlightLegSummaries(result, resultData);
  const parts = [
    collectMomondoFlightCarrierNames(legs, resultData).join("/"),
    formatMomondoFlightStops(legs),
    formatMomondoFlightTimeSummary(legs),
    formatMomondoFlightDurationSummary(legs),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function collectMomondoFlightCarrierNames(
  legs: MomondoFlightLegSummary[],
  resultData: Record<string, unknown>,
): string[] {
  const airlines = isRecord(resultData.airlines) ? resultData.airlines : {};
  const carriers = new Set<string>();
  for (const leg of legs) {
    for (const carrierCode of leg.carrierCodes) {
      const airline = isRecord(airlines[carrierCode]) ? airlines[carrierCode] : undefined;
      carriers.add(readStringValue(airline?.name) ?? carrierCode);
    }
  }
  return [...carriers];
}

function formatMomondoFlightStops(legs: MomondoFlightLegSummary[]): string | undefined {
  if (legs.length === 0) return undefined;
  if (legs.every((leg) => leg.stopCount === 0)) return "direkte";
  return legs.map((leg) => leg.stopCount === 0 ? "direkte" : `${leg.stopCount} stopp`).join(" / ");
}

function formatMomondoFlightTimeSummary(legs: MomondoFlightLegSummary[]): string | undefined {
  const ranges = legs
    .map((leg) => {
      const departureClock = formatMomondoFlightClock(leg.departureTime);
      const arrivalClock = formatMomondoFlightClock(leg.arrivalTime);
      return departureClock !== undefined && arrivalClock !== undefined
        ? `${departureClock}-${arrivalClock}`
        : undefined;
    })
    .filter((range): range is string => range !== undefined);
  return ranges.length > 0 ? ranges.join(" / ") : undefined;
}

function formatMomondoFlightClock(value: string | undefined): string | undefined {
  return value?.match(/T(\d{2}):(\d{2})/)?.slice(1, 3).join(":");
}

function formatMomondoFlightDurationSummary(legs: MomondoFlightLegSummary[]): string | undefined {
  const durations = legs
    .map((leg) => formatPanFlightsDuration(leg.durationMinutes))
    .filter((duration): duration is string => duration !== undefined);
  return durations.length > 0 ? durations.join(" / ") : undefined;
}

function formatMomondoFlightLuggageSummary(bookingOption: Record<string, unknown>): string | undefined {
  const fees = isRecord(bookingOption.fees) ? bookingOption.fees : undefined;
  const carryOn = formatMomondoLuggageValue(readStringValue(fees?.carryOnDisplay));
  const checked = formatMomondoLuggageValue(readStringValue(fees?.checkedBagDisplay));
  const parts = [
    carryOn !== undefined ? `håndbagasje ${carryOn}` : undefined,
    checked !== undefined ? `innsjekket ${checked}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatMomondoLuggageValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (/^inkludert$/i.test(cleaned)) return "inkl.";
  if (/^ukjent$/i.test(cleaned)) return "ukjent";
  if (/ikke\s+inkludert|ikke\s+inkl/i.test(cleaned)) return "ikke inkl.";
  return cleaned;
}

function formatFlightPrice(amount: number, currency: string): string {
  const formattedAmount = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(amount);
  return currency.toUpperCase() === "NOK" ? `${formattedAmount} kr` : `${formattedAmount} ${currency.toUpperCase()}`;
}

function readIataCodeParam(parsedUrl: URL, key: string): string | undefined {
  return readIataCodeValue(parsedUrl.searchParams.get(key));
}

function readIsoDateParam(parsedUrl: URL, key: string): string | undefined {
  return readIsoDateValue(parsedUrl.searchParams.get(key));
}

function readIataCodeValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return trimmed.match(/\b[A-Z]{3}\b/)?.[0];
}

function readIsoDateValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const dateMatch = value.trim().match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const parsedValue = dateMatch?.[1];
  if (parsedValue === undefined) return undefined;
  const parsedDate = new Date(`${parsedValue}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== parsedValue) {
    return undefined;
  }
  return parsedValue;
}

function readDottedIsoDateValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const dateMatch = value.trim().match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (dateMatch === null) return undefined;

  const [, day, month, year] = dateMatch;
  return readIsoDateValue(`${year}-${month}-${day}`);
}

function readCompactIsoDateValue(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return undefined;
  return readIsoDateValue(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

function readIataCodeFromValues(values: unknown[]): string | undefined {
  for (const value of values) {
    const code = readIataCodeFromValue(value);
    if (code !== undefined) return code;
  }
  return undefined;
}

function readIataCodeFromValue(value: unknown): string | undefined {
  const directValue = readIataCodeValue(value);
  if (directValue !== undefined) return directValue;

  if (Array.isArray(value)) {
    for (const item of value) {
      const code = readIataCodeFromValue(item);
      if (code !== undefined) return code;
    }
  }

  if (isRecord(value)) {
    return readIataCodeFromRecord(value, ["iata", "iataCode", "code", "airportCode", "stationCode"]);
  }

  return undefined;
}

function readIataCodeFromRecord(record: Record<string, unknown>, keys: string[]): string | undefined {
  return readIataCodeFromValues(keys.map((key) => readRecordValueCaseInsensitive(record, key)));
}

function readIsoDateFromValues(values: unknown[]): string | undefined {
  for (const value of values) {
    const date = readIsoDateFromValue(value);
    if (date !== undefined) return date;
  }
  return undefined;
}

function readIsoDateFromValue(value: unknown): string | undefined {
  const directValue = readIsoDateValue(value);
  if (directValue !== undefined) return directValue;

  const dottedValue = readDottedIsoDateValue(value);
  if (dottedValue !== undefined) return dottedValue;

  if (Array.isArray(value)) {
    for (const item of value) {
      const date = readIsoDateFromValue(item);
      if (date !== undefined) return date;
    }
  }

  if (isRecord(value)) {
    return readIsoDateFromRecord(value, ["date", "dateTime", "localDate", "value"]);
  }

  return undefined;
}

function readIsoDateFromRecord(record: Record<string, unknown>, keys: string[]): string | undefined {
  return readIsoDateFromValues(keys.map((key) => readRecordValueCaseInsensitive(record, key)));
}

function readPositiveIntegerFromRecord(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readPositiveIntegerValue(readRecordValueCaseInsensitive(record, key));
    if (value !== undefined) return value;
  }
  return undefined;
}

function readNonNegativeIntegerFromRecord(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNonNegativeIntegerValue(readRecordValueCaseInsensitive(record, key));
    if (value !== undefined) return value;
  }
  return undefined;
}

function readPositiveIntegerValue(value: unknown): number | undefined {
  const parsedValue = readNonNegativeIntegerValue(value);
  return parsedValue !== undefined && parsedValue > 0 ? parsedValue : undefined;
}

function readNonNegativeIntegerValue(value: unknown): number | undefined {
  const parsedValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : undefined;
}

function readRecordValueCaseInsensitive(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  const lowerKey = key.toLowerCase();
  return Object.entries(record).find(([entryKey]) => entryKey.toLowerCase() === lowerKey)?.[1];
}

function parseJsonValue(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readNonNegativeIntegerParam(parsedUrl: URL, key: string, fallback: number): number {
  const value = parsedUrl.searchParams.get(key);
  if (value === null) return fallback;
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function splitIsoDateParts(value: string): { year: string; month: string; day: string } {
  return {
    year: value.slice(0, 4),
    month: value.slice(5, 7),
    day: value.slice(8, 10),
  };
}

function readPositiveNumberValue(value: unknown): number | undefined {
  const numberValue = readNumberValue(value);
  return numberValue !== undefined && numberValue > 0 ? numberValue : undefined;
}

function compactIsoDate(value: string): string {
  return value.replace(/-/g, "");
}

function comparePriceMatchesBySortAmount(
  left: Pick<PriceMatchOffer, "amount" | "sortAmount">,
  right: Pick<PriceMatchOffer, "amount" | "sortAmount">,
): number {
  return (left.sortAmount ?? left.amount) - (right.sortAmount ?? right.amount);
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function formatNokFlightPrice(amount: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(amount)} kr`;
}

function formatApproxNokFlightPrice(amount: number): string {
  return `~${formatNokFlightPrice(amount)}`;
}

function formatFinnFlightTripSummary(trip: Record<string, unknown>): string {
  const legs = readRecordArray(trip.legs);
  return [
    collectFinnFlightCarrierNames(legs).join("/"),
    formatFinnFlightStops(legs),
    formatFinnFlightTimeSummary(legs),
  ].filter((part): part is string => part !== undefined && part.length > 0).join(", ");
}

function collectFinnFlightCarrierNames(legs: Array<Record<string, unknown>>): string[] {
  const carriers = new Set<string>();
  for (const leg of legs) {
    for (const segment of readRecordArray(leg.segments)) {
      const carrier = readStringValue(segment.marketingCarrierName) ?? readStringValue(segment.marketingCarrier);
      if (carrier !== undefined) carriers.add(carrier);
    }
  }
  return [...carriers];
}

function readFinnFlightLegStopCount(leg: Record<string, unknown>): number {
  const declaredStops = readNumberValue(leg.numberOfStops);
  if (declaredStops !== undefined) return Math.max(0, Math.trunc(declaredStops));
  return Math.max(0, readRecordArray(leg.segments).length - 1);
}

function formatFinnFlightStops(legs: Array<Record<string, unknown>>): string | undefined {
  if (legs.length === 0) return undefined;

  const stops = legs.map((leg) => {
    return readFinnFlightLegStopCount(leg);
  });
  if (stops.every((stopCount) => stopCount === 0)) return "direkte";
  return stops.map((stopCount) => stopCount === 0 ? "direkte" : `${stopCount} stopp`).join(" / ");
}

function formatFinnFlightTimeSummary(legs: Array<Record<string, unknown>>): string | undefined {
  const ranges = legs
    .map(formatFinnFlightLegTimeRange)
    .filter((range): range is string => range !== undefined);
  return ranges.length > 0 ? ranges.join(" / ") : undefined;
}

function formatFinnFlightLegTimeRange(leg: Record<string, unknown>): string | undefined {
  const firstSegment = readRecordArray(leg.segments)[0];
  const departureTime = readStringValue(leg.legDepartureTime) ?? readStringValue(firstSegment?.departureTime);
  const arrivalTime = readStringValue(leg.legArrivalTime) ?? readStringValue(firstSegment?.arrivalTime);
  const departureClock = formatFinnFlightClock(departureTime);
  const arrivalClock = formatFinnFlightClock(arrivalTime);
  return departureClock !== undefined && arrivalClock !== undefined
    ? `${departureClock}-${arrivalClock}`
    : undefined;
}

function formatFinnFlightClock(value: string | undefined): string | undefined {
  return value?.match(/T(\d{2}):(\d{2})/)?.slice(1, 3).join(":");
}

function formatFinnFlightLuggageSummary(offer: Record<string, unknown>): string | undefined {
  const handLuggage = formatFinnFlightLuggageValue(readStringValue(offer.handLuggage));
  const checkedLuggage = formatFinnFlightLuggageValue(readStringValue(offer.checkedLuggage));
  const parts = [
    handLuggage !== undefined ? `håndbagasje ${handLuggage}` : undefined,
    checkedLuggage !== undefined ? `innsjekket ${checkedLuggage}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatFinnFlightLuggageValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "included") return "inkl.";
  if (value === "not_included") return "ikke inkl.";
  if (value === "unknown") return "ukjent";
  return value.replace(/_/g, " ");
}

function formatFlightDateRange(flightMeta: FlightSearchMeta): string {
  if (flightMeta.inboundDate === undefined) {
    return formatFlightDate(flightMeta.outboundDate);
  }
  return `${formatFlightDate(flightMeta.outboundDate)} - ${formatFlightDate(flightMeta.inboundDate)}`;
}

function formatFlightDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatFlightPassengerText(flightMeta: FlightSearchMeta): string {
  return flightMeta.adults === 1 ? "1 voksen" : `${flightMeta.adults} voksne`;
}

function formatFlightCardSearchDetails(flightMeta: FlightSearchMeta): string {
  const tripType = flightMeta.inboundDate === undefined ? "En vei" : "Tur/retur";
  return `${tripType}, ${formatFlightPassengerText(flightMeta)}`;
}

function buildFlightSearchMetaKey(flightMeta: FlightSearchMeta): string {
  return [
    flightMeta.origin,
    flightMeta.destination,
    flightMeta.outboundDate,
    flightMeta.inboundDate ?? "",
    flightMeta.adults,
    flightMeta.youths,
    flightMeta.children,
    flightMeta.infants,
  ].join("|");
}

async function getRegionPricesForCurrentPage(): Promise<PlayStationRegionPriceResult | undefined> {
  const currentUrl = window.location.href;
  const regionPriceLookupUrl = getRegionPriceLookupUrlForCurrentPage(currentUrl);
  if (regionPriceLookupUrl === undefined) {
    return undefined;
  }

  const message: GetPlayStationRegionPricesMessage = {
    type: "get-playstation-region-prices",
    url: regionPriceLookupUrl,
  };

  if (isUserscriptRuntime()) {
    if (isPlayStationProductUrl(regionPriceLookupUrl)) {
      return findPlayStationRegionPrices(
        regionPriceLookupUrl,
        (url) => userscriptTextRequest(url),
        (url) => userscriptJsonRequest(url),
      );
    }

    return findAppStorePriceRegionPricesForUrl(
      regionPriceLookupUrl,
      (url) => userscriptTextRequest(url),
      (url) => userscriptJsonRequest(url),
    );
  }

  const response = await sendRuntimeMessage<PlayStationRegionPricesResponse>(message);
  if (response !== undefined && isPlayStationRegionPricesResponse(response) && response.ok) {
    return response.result;
  }
  return undefined;
}

function getRegionPriceLookupUrlForCurrentPage(currentUrl: string): string | undefined {
  if (isPlayStationProductUrl(currentUrl) || isAppStorePriceRegionPriceUrl(currentUrl)) {
    return currentUrl;
  }

  const appleAppStoreUrl = extractAppleAppStoreUrlFromCurrentDocument();
  if (appleAppStoreUrl !== undefined) {
    return appleAppStoreUrl;
  }

  return isPotentialAppStorePriceRegionPriceUrl(currentUrl) ? currentUrl : undefined;
}

function extractAppleAppStoreUrlFromCurrentDocument(): string | undefined {
  const smartBannerAppId = document
    .querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]')
    ?.content.match(/(?:^|,\s*)app-id=(\d+)/i)?.[1];
  if (smartBannerAppId !== undefined) {
    const smartBannerUrl = `https://apps.apple.com/app/id${smartBannerAppId}`;
    if (isAppStorePriceRegionPriceUrl(smartBannerUrl)) {
      return smartBannerUrl;
    }
  }

  const metaContentCandidates = [
    ...Array.from(document.querySelectorAll<HTMLMetaElement>("meta[property='og:url'], meta[name='twitter:app:url:iphone'], meta[name='twitter:app:url:ipad']"))
      .map((element) => element.content),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='canonical'], link[rel='alternate']"))
      .map((element) => element.href),
  ];
  const metaUrl = metaContentCandidates.find(isAppStorePriceRegionPriceUrl);
  if (metaUrl !== undefined) {
    return metaUrl;
  }

  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((element) => element.href)
    .find(isAppStorePriceRegionPriceUrl);
}

function isUserscriptRuntime(): boolean {
  return (chrome.runtime as { id?: string }).id === undefined;
}

async function userscriptJsonRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
): Promise<unknown | undefined> {
  const gmRequest = typeof GM_xmlhttpRequest === "function"
    ? GM_xmlhttpRequest
    : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : undefined;

  if (gmRequest !== undefined) {
    return new Promise((resolveValue) => {
      const requestOptions: UserscriptHttpRequestOptions = {
        method: init?.method ?? "GET",
        url,
        timeout: 15000,
        onload: (response) => {
          resolveValue(parseUserscriptJsonResponse(response));
        },
        onerror: () => resolveValue(undefined),
        ontimeout: () => resolveValue(undefined),
      };
      if (init?.headers !== undefined) requestOptions.headers = init.headers;
      if (init?.body !== undefined) requestOptions.data = init.body;

      const maybePromise = gmRequest(requestOptions);
      if (isPromiseLike(maybePromise)) {
        maybePromise.then(
          (response) => resolveValue(parseUserscriptJsonResponse(response)),
          () => resolveValue(undefined),
        );
      }
    });
  }

  if (!isUserscriptRuntime()) {
    const response = await sendRuntimeMessage<HttpRequestResponse>({
      type: "http-request",
      url,
      responseType: "json",
      ...init,
    } satisfies HttpRequestMessage);
    return isHttpRequestJsonResponse(response) ? response.value : undefined;
  }

  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

async function userscriptTextRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
): Promise<string | undefined> {
  const gmRequest = typeof GM_xmlhttpRequest === "function"
    ? GM_xmlhttpRequest
    : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : undefined;

  if (gmRequest !== undefined) {
    return new Promise((resolveValue) => {
      const requestOptions: UserscriptHttpRequestOptions = {
        method: init?.method ?? "GET",
        url,
        timeout: 15000,
        onload: (response) => {
          resolveValue(readUserscriptTextResponse(response));
        },
        onerror: () => resolveValue(undefined),
        ontimeout: () => resolveValue(undefined),
      };
      if (init?.headers !== undefined) requestOptions.headers = init.headers;
      if (init?.body !== undefined) requestOptions.data = init.body;

      const maybePromise = gmRequest(requestOptions);
      if (isPromiseLike(maybePromise)) {
        maybePromise.then(
          (response) => resolveValue(readUserscriptTextResponse(response)),
          () => resolveValue(undefined),
        );
      }
    });
  }

  if (!isUserscriptRuntime()) {
    const response = await sendRuntimeMessage<HttpRequestResponse>({
      type: "http-request",
      url,
      responseType: "text",
      ...init,
    } satisfies HttpRequestMessage);
    return isHttpRequestTextResponse(response) ? response.text : undefined;
  }

  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.text();
  } catch {
    return undefined;
  }
}

function isHttpRequestJsonResponse(value: unknown): value is Extract<HttpRequestResponse, { responseType: "json" }> {
  return isRecord(value) && value.ok === true && value.responseType === "json";
}

function isHttpRequestTextResponse(value: unknown): value is Extract<HttpRequestResponse, { responseType: "text" }> {
  return isRecord(value) && value.ok === true && value.responseType === "text" && typeof value.text === "string";
}

function parseUserscriptJsonResponse(response: unknown): unknown | undefined {
  if (!isRecord(response)) return undefined;
  const status = typeof response.status === "number" ? response.status : 200;
  if (status < 200 || status >= 300) return undefined;
  const body = response.response ?? response.responseText;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function readUserscriptTextResponse(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const status = typeof response.status === "number" ? response.status : 200;
  if (status < 200 || status >= 300) return undefined;
  const body = response.response ?? response.responseText;
  return typeof body === "string" ? body : undefined;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
  return new Promise((resolveValue) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (chrome.runtime.lastError !== undefined) {
        resolveValue(undefined);
        return;
      }
      resolveValue(response as T);
    });
  });
}

function extractProductPageMeta(): ProductPageMeta | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    return undefined;
  }
  const normalizedHostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hasBlockedHostname(PRICE_MATCH_SOURCE_HOSTS, normalizedHostname) && !isKnownPriceMatchSourceProductPage(parsedUrl)) {
    return undefined;
  }

  const vinmonopoletText = normalizedHostname === "vinmonopolet.no"
    ? document.body?.innerText.slice(0, 12000) ?? ""
    : "";
  const productLdJson = findProductLdJson();
  const offer = readFirstOffer(productLdJson?.offers);
  const titleMeta = document.querySelector<HTMLMetaElement>('meta[name="title"]')?.content.trim();
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content.trim();
  const h1 = document.querySelector("h1")?.textContent?.trim();
  const codes = uniqueStrings([...collectProductCodes(productLdJson), ...collectProductCodesFromUrl(parsedUrl)]);
  const productPageClue =
    isVinmonopoletProductPage(parsedUrl) ||
    isTaxfreeProductPage(parsedUrl) ||
    hasProductStructuredDataSignal(productLdJson, offer, codes) ||
    (document.querySelector('meta[property="og:type"][content="product"]') !== null && (hasVisiblePriceSignal() || hasCommerceActionSignal())) ||
    codes.length > 0 ||
    isLikelyCommerceProductPage(parsedUrl);
  if (
    isLikelyProductListingPage(parsedUrl) &&
    document.querySelector('meta[property="og:type"][content="product"]') === null &&
    !isLikelyCommerceProductPage(parsedUrl)
  ) {
    return undefined;
  }

  const productName = readStringValue(productLdJson?.name);
  const brandName = readBrandName(productLdJson?.brand);
  const vinmonopoletProductName = normalizedHostname === "vinmonopolet.no"
    ? readVinmonopoletProductName(parsedUrl, h1)
    : undefined;
  const searchTerm =
    vinmonopoletProductName ??
    (productName !== undefined
      ? brandName !== undefined && !productName.toLowerCase().includes(brandName.toLowerCase())
        ? `${brandName} ${productName}`
        : productName
      : h1 ?? titleMeta ?? ogTitle ?? document.title);
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
  const productTitleCandidates = uniqueStrings([
    normalizedSearchTerm,
    productName,
    brandName !== undefined && productName !== undefined && !productName.toLowerCase().includes(brandName.toLowerCase())
      ? `${brandName} ${productName}`
      : undefined,
    h1,
    titleMeta,
    ogTitle,
    document.title,
  ]);
  const packageQuantity = readProductPackageQuantity(productLdJson, productTitleCandidates);

  if (!productPageClue || normalizedSearchTerm.length < 8) {
    return undefined;
  }

  const visibleVinmonopoletPrice = vinmonopoletText.length > 0 ? readVinmonopoletPrice(vinmonopoletText) : undefined;
  const price = readNumberValue(offer?.price) ?? visibleVinmonopoletPrice;
  const currency = readStringValue(offer?.priceCurrency) ?? (visibleVinmonopoletPrice !== undefined ? "NOK" : undefined);
  const productUrl = readUrlValue(productLdJson?.url);
  const organizationName = findOrganizationName();
  const volumeMl = vinmonopoletText.length > 0 ? readVinmonopoletVolumeMl(vinmonopoletText, price) : undefined;
  const alcoholPercent = vinmonopoletText.length > 0 ? readVinmonopoletAlcoholPercent(vinmonopoletText) : undefined;

  return {
    url: window.location.href,
    searchTerm: normalizedSearchTerm,
    productPageClue,
    ...(price !== undefined ? { price } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(productUrl !== undefined ? { productUrl } : {}),
    ...(codes.length > 0 ? { codes } : {}),
    ...(productTitleCandidates.length > 0 ? { productTitleCandidates } : {}),
    ...(organizationName !== undefined ? { organizationName } : {}),
    ...(brandName !== undefined ? { productBrand: brandName } : {}),
    ...(packageQuantity !== undefined ? { packageAmount: packageQuantity.amount, packageUnit: packageQuantity.unit } : {}),
    ...(volumeMl !== undefined ? { volumeMl } : {}),
    ...(alcoholPercent !== undefined ? { alcoholPercent } : {}),
  };
}

function hasProductStructuredDataSignal(
  product: Record<string, unknown> | undefined,
  offer: Record<string, unknown> | undefined,
  codes: string[],
): boolean {
  if (product === undefined) return false;
  const productName = readStringValue(product.name);
  if (productName === undefined) return false;
  if (codes.length > 0) return true;
  if (readNumberValue(offer?.price) !== undefined || readStringValue(offer?.priceCurrency) !== undefined) return true;
  return hasVisiblePriceSignal() && hasCommerceActionSignal();
}

function isLikelyProductListingPage(parsedUrl: URL): boolean {
  const pathname = parsedUrl.pathname.toLowerCase();
  const listingPath = /(?:^|\/)(?:search|sok|søk|resultat|results|kategori|category|categories|c|collections?|collections|list|listing)(?:\/|$)/i.test(pathname);
  const listingQuery = [...parsedUrl.searchParams.keys()].some((key) => /^(?:q|query|search|sok|søk|keyword|term|category|filter|sort|page)$/i.test(key));
  if (!listingPath && !listingQuery) return false;

  const productCardCount = document.querySelectorAll(
    [
      "[data-product-id]",
      "[data-productid]",
      "[data-product]",
      ".product-card",
      ".product-tile",
      ".product-item",
      ".product-list-item",
      "article",
    ].join(","),
  ).length;
  const visiblePriceCount = (document.body?.innerText.match(/\b(?:kr|NOK)\s?\d|\d[\d\s]*(?:,\d{2})?\s?(?:kr|NOK)\b/gi) ?? []).length;
  return productCardCount >= 2 || visiblePriceCount >= 3;
}

function isKnownPriceMatchSourceProductPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  if (
    hostname.endsWith("prisjakt.no") ||
    hostname.endsWith("prisjakt.nu") ||
    hostname.endsWith("prisjakt.se") ||
    hostname.endsWith("prisjagt.dk") ||
    hostname.endsWith("pricespy.co.uk") ||
    hostname.endsWith("pricespy.co.nz") ||
    hostname.endsWith("hintaopas.fi") ||
    hostname.endsWith("ledenicheur.fr")
  ) {
    return (pathname === "/product.php" && parsedUrl.searchParams.has("p")) || /^\/produkt(?:er)?\//.test(pathname);
  }

  if (hostname.endsWith("godpris.no")) {
    return /^\/produkt\/[^/]+\/?$/.test(pathname);
  }

  if (hostname.endsWith("tax-free.no")) {
    return /^\/(?:no\/)?product\d+(?:\/|$)/.test(pathname);
  }

  if (hostname.endsWith("klarna.com")) {
    return /\/shopping\/pl\/(?:cl\d+\/)?\d+\//.test(pathname);
  }

  if (hostname.endsWith("kelkoo.no")) {
    return /^\/gtin\/\d+\/?$/.test(pathname);
  }

  if (hostname.endsWith("prisradar.no")) {
    return /^\/produkter\/[^/]+\/?$/.test(pathname);
  }

  if (hostname.endsWith("sesum.no")) {
    return /^\/produkt\/[^/]+\/?$/.test(pathname);
  }

  if (hostname.endsWith("enhver.no")) {
    return /^\/brands\/[^/]+\/\d+\/?$/.test(pathname);
  }

  if (hostname.endsWith("kassal.app")) {
    return /^\/vare\/[^/]+\/?$/.test(pathname);
  }

  if (isItadGameStoreProductUrl(parsedUrl.toString())) {
    return true;
  }

  return false;
}

function isVinmonopoletProductPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "vinmonopolet.no" && /\/p\/\d+(?:\/|$)/i.test(parsedUrl.pathname);
}

function isTaxfreeProductPage(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "tax-free.no" && /^\/(?:no\/)?product\d+(?:\/|$)/i.test(parsedUrl.pathname);
}

function isDynamicPriceMatchProductPage(parsedUrl: URL): boolean {
  return extractFlightSearchMeta(parsedUrl) !== undefined ||
    isVinmonopoletProductPage(parsedUrl) ||
    isTaxfreeProductPage(parsedUrl) ||
    isEpicGamesStoreProductUrl(parsedUrl.toString()) ||
    isSteamAppProductUrl(parsedUrl.toString()) ||
    isMicrosoftStoreProductUrl(parsedUrl.toString());
}

function isDynamicPriceMatchHost(parsedUrl: URL): boolean {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "sas.no" ||
    hostname === "finn.no" ||
    hostname === "momondo.no" ||
    hostname === "panflights.no" ||
    hostname === "panflights.com" ||
    hostname === "travellink.no" ||
    hostname === "trip.com" ||
    hostname.endsWith(".trip.com") ||
    hostname === "shop.lufthansa.com" ||
    hostname === "booking.norwegian.com" ||
    hostname === "skyscanner.no" ||
    hostname === "skyscanner.net" ||
    hostname === "vinmonopolet.no" ||
    hostname === "tax-free.no" ||
    hostname === "store.epicgames.com" ||
    hostname === "store.steampowered.com" ||
    hostname === "xbox.com" ||
    hostname === "apps.microsoft.com";
}

function readVinmonopoletProductName(parsedUrl: URL, h1: string | undefined): string | undefined {
  if (!isVinmonopoletProductPage(parsedUrl)) return undefined;
  if (h1 !== undefined && h1.length >= 3 && h1.length <= 80) return h1;

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
  if (productIndex <= 0) return undefined;

  try {
    return decodeURIComponent(segments[productIndex - 1] ?? "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\s+/g, " ") || undefined;
  } catch {
    return undefined;
  }
}

function isLikelyCommerceProductPage(parsedUrl: URL): boolean {
  if (isTaxfreeProductPage(parsedUrl)) {
    return true;
  }

  if (isItadGameStoreProductUrl(parsedUrl.toString())) {
    return true;
  }

  const strongProductishPath =
    /(?:^|\/)(?:product|produkt|produkter)\/[^/]+/i.test(parsedUrl.pathname) ||
    /^\/(?:i|p)\/\d+\/[-\w%]+\/?$/i.test(parsedUrl.pathname);
  if (strongProductishPath && (hasVisiblePriceSignal() || hasCommerceActionSignal())) {
    return true;
  }

  const productishPath =
    /\b(product|produkt|produkter|p|i|item|shop|varer|sku)\b/i.test(parsedUrl.pathname) ||
    [...parsedUrl.searchParams.keys()].some((key) => /\b(product|produkt|sku|mpn|gtin|ean)\b/i.test(key));
  if (!productishPath) return false;

  return hasVisiblePriceSignal() && hasCommerceActionSignal();
}

function hasVisiblePriceSignal(): boolean {
  if (document.querySelector('[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]') !== null) {
    return true;
  }

  const bodyText = document.body?.innerText.slice(0, 8000) ?? "";
  return /\b(?:kr|NOK)\s?\d|\d[\d\s]*(?:,\d{2})?\s?(?:kr|NOK)\b/i.test(bodyText);
}

function hasCommerceActionSignal(): boolean {
  const commerceText = [
    "legg i handlekurv",
    "legg til handlekurv",
    "kjøp",
    "kjop",
    "add to cart",
    "add to basket",
  ];

  for (const element of document.querySelectorAll("button, a, input")) {
    const text = `${element.textContent ?? ""} ${(element as HTMLInputElement).value ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim().toLowerCase();
    if (commerceText.some((needle) => text.includes(needle))) return true;
  }

  return false;
}

function findProductLdJson(): Record<string, unknown> | undefined {
  for (const entry of readLdJsonEntries()) {
    const product = findTypedLdJson(entry, "Product");
    if (product !== undefined) return product;
  }
  return undefined;
}

function findOrganizationName(): string | undefined {
  for (const entry of readLdJsonEntries()) {
    const organization = findTypedLdJson(entry, "Organization") ?? findTypedLdJson(entry, "WebSite");
    const name = readStringValue(organization?.name);
    if (name !== undefined) return name;
    const offer = findTypedLdJson(entry, "Offer");
    const sellerName = readBrandName(offer?.seller);
    if (sellerName !== undefined) return sellerName;
  }
  return undefined;
}

function readLdJsonEntries(): unknown[] {
  const entries: unknown[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      entries.push(JSON.parse(script.textContent ?? ""));
    } catch {
      // Ignore malformed site metadata.
    }
  }
  return entries;
}

function findTypedLdJson(value: unknown, type: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedLdJson(item, type);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findTypedLdJson(item, type);
      if (found !== undefined) return found;
    }
  }
  const rawType = value["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((item) => item === type) ? value : undefined;
}

function readFirstOffer(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    return value.find(isRecord);
  }
  return isRecord(value) ? value : undefined;
}

function readBrandName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return isRecord(value) ? readStringValue(value.name) : undefined;
}

function readStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readUrlValue(value: unknown): string | undefined {
  const url = readStringValue(value);
  return url !== undefined && parseUrlWithBase(url, window.location.href) !== undefined
    ? parseUrlWithBase(url, window.location.href)?.toString()
    : undefined;
}

function collectProductCodes(product: Record<string, unknown> | undefined): string[] {
  if (product === undefined) return [];
  const codes = new Set<string>();
  for (const [key, value] of Object.entries(product)) {
    if (!/^(gtin|ean|barcode|sku|mpn)/i.test(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string" || typeof item === "number") {
        const code = String(item).trim();
        if (code.length > 0) codes.add(code);
      }
    }
  }
  return [...codes];
}

function collectProductCodesFromUrl(parsedUrl: URL): string[] {
  return uniqueStrings(`${parsedUrl.pathname} ${parsedUrl.search}`.match(/\b\d{8,14}\b/g) ?? []);
}

function readProductPackageQuantity(
  product: Record<string, unknown> | undefined,
  titleCandidates: string[],
): ProductPackageQuantity | undefined {
  if (product !== undefined) {
    for (const value of [
      product.weight,
      product.size,
      product.netWeight,
      product.volume,
      product.additionalProperty,
    ]) {
      const quantity = readPackageQuantityFromStructuredValue(value);
      if (quantity !== undefined) return quantity;
    }
  }

  const textQuantity = readPackageQuantityFromText([
    readStringValue(product?.description),
    ...titleCandidates,
  ].filter((value): value is string => value !== undefined).join(" "));
  return textQuantity;
}

function readPackageQuantityFromStructuredValue(value: unknown): ProductPackageQuantity | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const quantity = readPackageQuantityFromStructuredValue(item);
      if (quantity !== undefined) return quantity;
    }
    return undefined;
  }

  const quantity = readPackageQuantityFromValue(value);
  if (quantity !== undefined) return quantity;

  if (!isRecord(value)) return undefined;
  return readPackageQuantityFromText(Object.values(value).map((item) => String(item)).join(" "));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function readVinmonopoletPrice(text: string): number | undefined {
  const match = text.match(/\bKr\s+(\d[\d\s]*(?:,\d{1,2})?)/i);
  if (match?.[1] === undefined) return undefined;

  const amount = parseLocalizedNumber(match[1].replace(/\s/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function readVinmonopoletVolumeMl(text: string, price: number | undefined): number | undefined {
  const priceLine = text.match(/\bKr\s+\d[\d\s]*(?:,\d{1,2})?[\s\S]{0,80}/i)?.[0];
  return readVolumeMl(priceLine) ?? readVolumeMl(text) ?? readVolumeMlFromLiterPrice(text, price);
}

function readVinmonopoletAlcoholPercent(text: string): number | undefined {
  const match = text.match(/\bAlkohol\s+(\d+(?:[,.]\d+)?)\s*%/i);
  if (match?.[1] === undefined) return undefined;

  const amount = parseLocalizedNumber(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function readVolumeMl(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;

  const match = text.match(/\b(\d+(?:[,.]\d+)?)\s*(ml|cl|l)(?=$|[^A-Za-z])/i);
  if (match === null) return undefined;

  const amount = parseLocalizedNumber(match[1] ?? "");
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || unit === undefined) return undefined;
  if (unit === "ml") return amount;
  if (unit === "cl") return amount * 10;
  return amount * 1000;
}

function readVolumeMlFromLiterPrice(text: string, price: number | undefined): number | undefined {
  if (price === undefined || price <= 0) return undefined;

  const unitPrice = readVinmonopoletUnitPricePerLiter(text);
  if (unitPrice === undefined || unitPrice <= 0) return undefined;

  const volumeMl = Math.round((price / unitPrice) * 1000);
  if (!Number.isFinite(volumeMl) || volumeMl < 20 || volumeMl > 5000) return undefined;

  const commonVolumeMl = [40, 50, 100, 187, 200, 250, 330, 350, 375, 500, 700, 750, 1000, 1500, 1750, 2000, 3000];
  const closest = commonVolumeMl.reduce((best, candidate) => (
    Math.abs(candidate - volumeMl) < Math.abs(best - volumeMl) ? candidate : best
  ), commonVolumeMl[0] ?? volumeMl);

  return Math.abs(closest - volumeMl) <= Math.max(5, closest * 0.03) ? closest : volumeMl;
}

function readVinmonopoletUnitPricePerLiter(text: string): number | undefined {
  const match = text.match(/\b(\d[\d\s]*(?:,\d{1,2})?)\s*kr\s*\/\s*l\b/i);
  if (match?.[1] === undefined) return undefined;

  const amount = parseLocalizedNumber(match[1].replace(/\s/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}
function makeAdChip(): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.textContent = "Ad";
  chip.style.cssText = "display:inline-block;font-size:9px;font-weight:600;color:#78909c;border:1px solid #78909c;border-radius:3px;padding:0 3px;margin-right:6px;vertical-align:middle;line-height:14px;";
  return chip;
}

function getCodeSourceProvider(codeOffer: CashbackOffer): string | undefined {
  if (codeOffer.provider !== "rabattkode") {
    return codeOffer.provider;
  }

  const parsed = parseUrl(codeOffer.sourceUrl) ?? parseUrl(codeOffer.activationUrl);
  const hostname = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";

  if (hostname === "bob.no" || hostname.endsWith(".bob.no")) return "bob";
  if (hostname === "dnb.no" || hostname.endsWith(".dnb.no")) return "dnb";
  if (hostname === "tfbank.no" || hostname.endsWith(".tfbank.no")) return "tfbank";
  return undefined;
}

function createProviderBadgeWithActivation(
  offer: CashbackOffer,
  activeOfferKey: string | undefined,
  shadowRoot: ShadowRoot,
): HTMLSpanElement {
  const providerWrap = document.createElement("span");
  providerWrap.className = "provider-wrap";

  const providerBadge = document.createElement("span");
  providerBadge.className = `provider-badge provider-${offer.provider}`;
  providerBadge.textContent = formatProviderName(offer.provider);

  if (isOfferActivated(offer, activeOfferKey)) {
    const activationBadge = document.createElement("span");
    activationBadge.className = "activation-badge";
    activationBadge.setAttribute("aria-label", `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`);
    activationBadge.innerHTML = CHECK_ICON_SVG;
    const activationTooltip = document.createElement("div");
    activationTooltip.className = "status-tooltip";
    activationTooltip.textContent = `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`;
    shadowRoot.append(activationTooltip);
    activationBadge.addEventListener("mouseenter", () => {
      positionStatusTooltipAbovePanel(activationTooltip, activationBadge, shadowRoot);
      activationTooltip.classList.add("visible");
    });
    activationBadge.addEventListener("mouseleave", () => {
      activationTooltip.classList.remove("visible");
    });
    providerWrap.append(activationBadge);
  }
  providerWrap.append(providerBadge);

  return providerWrap;
}

function installOfferActivationClickTracker(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[href]");

    const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    const trumfActivationUrl = link !== null && isTrumfLogOfferClickUrl(link.href) ? link.href : undefined;
    const sasActivationUrl = isSasActivationClick(target, link) ? getCurrentSasOfferActivationUrl() : undefined;
    const nettbonusActivationUrl = isNettbonusActivationClick(target, link) ? getCurrentNettbonusOfferActivationUrl() : undefined;
    const spareborsenActivationUrl = isSpareborsenActivationClick(target) ? getCurrentSpareborsenOfferActivationUrl() : undefined;
    const rabbleActivationUrl = isRabbleActivationClick(target) ? getCurrentRabbleOfferActivationUrl() : undefined;
    const provider = trumfActivationUrl !== undefined ? "trumf" : sasActivationUrl !== undefined ? "sas" : nettbonusActivationUrl !== undefined ? "nettbonus" : spareborsenActivationUrl !== undefined ? "spareborsen" : rabbleActivationUrl !== undefined ? "rabble" : undefined;
    const activationUrl = trumfActivationUrl ?? sasActivationUrl ?? nettbonusActivationUrl ?? spareborsenActivationUrl ?? rabbleActivationUrl;

    if (provider === undefined || activationUrl === undefined) {
      return;
    }

    const canWaitForStorageBeforeNavigation = link !== null && (
      trumfActivationUrl !== undefined ||
      nettbonusActivationUrl !== undefined ||
      (sasActivationUrl !== undefined && isSasOutboundActivationUrl(link.href))
    );

    if (link === null || !canWaitForStorageBeforeNavigation) {
      void markOfferActivated(provider, activationUrl);
      return;
    }

    const opensSameTab = link.target === "" || link.target === "_self";

    if (hasModifier || !opensSameTab) {
      void markOfferActivated(provider, activationUrl);
      return;
    }

    event.preventDefault();
    void markOfferActivated(provider, activationUrl).finally(() => {
      window.location.assign(link.href);
    });
  }, true);
}

function isOfferActivated(
  offer: Pick<CashbackOffer, "provider" | "activationUrl" | "sourceUrl">,
  activeOfferKey: string | undefined,
): boolean {
  const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
  return activationKey !== undefined && activationKey === activeOfferKey;
}

function getLastActivatedOfferKey(
  offers: readonly Pick<CashbackOffer, "provider" | "activationUrl" | "sourceUrl">[],
  activatedOffers: Readonly<Record<string, number>>,
): string | undefined {
  let latestKey: string | undefined;
  let latestActivatedAt = -1;

  for (const offer of offers) {
    const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
    if (activationKey === undefined) {
      continue;
    }

    const activatedAt = activatedOffers[activationKey];
    if (typeof activatedAt === "number" && activatedAt > latestActivatedAt) {
      latestKey = activationKey;
      latestActivatedAt = activatedAt;
    }
  }

  return latestKey;
}

type ActivationContext = "normal" | "incognito";

async function readActivatedOffers(now = Date.now()): Promise<Record<string, number>> {
  const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations, changed } = pruneStoredActivatedOffers(stored, now);

  if (isRecord(stored) && changed) {
    await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
  }

  return filterActivatedOffersForContext(activations, getCurrentActivationContext());
}

async function markOfferActivated(provider: string, rawUrl: string, now = Date.now()): Promise<void> {
  const activationKey = getProviderActivationKey(provider, rawUrl);
  if (activationKey === undefined) {
    return;
  }

  const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations } = pruneStoredActivatedOffers(stored, now);
  activations[getActivationStorageKey(getCurrentActivationContext(), activationKey)] = now;

  await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
}

function isTrumfLogOfferClickUrl(rawUrl: string): boolean {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined) {
    return false;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "trumfnetthandel.no" && /^\/LogOfferClick\/\d+\/\d+\/?$/.test(parsedUrl.pathname);
}

function isSasActivationClick(target: Element, link: HTMLAnchorElement | null): boolean {
  if (getCurrentSasOfferActivationUrl() === undefined) {
    return false;
  }

  if (link !== null && isSasOutboundActivationUrl(link.href)) {
    return true;
  }

  const clickable = target.closest<HTMLElement>("button,a,[role='button']");
  const text = clickable?.textContent?.trim().replace(/\s+/g, " ").toLowerCase();
  return text === "handle nå" || text === "shop now";
}

function getCurrentSasOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (hostname !== "onlineshopping.flysas.com" || pathParts.length < 4 || pathParts[1]?.toLowerCase() !== "butikker") {
    return undefined;
  }

  const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
  const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/")
    ? parsedUrl.pathname.slice(0, -1)
    : parsedUrl.pathname;
  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${pathname}`;
}

function isSasOutboundActivationUrl(rawUrl: string): boolean {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined) {
    return false;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return (
    hostname === "go.adt246.net" ||
    hostname.endsWith(".adt246.net") ||
    parsedUrl.searchParams.get("utm_source")?.toLowerCase() === "adtraction" ||
    parsedUrl.searchParams.get("utm_medium")?.toLowerCase() === "affiliate"
  );
}

function isNettbonusActivationClick(_target: Element, link: HTMLAnchorElement | null): boolean {
  if (getCurrentNettbonusOfferActivationUrl() === undefined) {
    return false;
  }

  if (link === null) {
    return false;
  }

  // The activation link on nettbonus detail pages has class "partnerDetailsAction"
  // and/or id "externalLink", pointing to tradedoubler/other tracking URLs
  if (link.href === NETTBONUS_REFERRAL_URL) {
    return false;
  }
  return link.classList.contains("partnerDetailsAction") || link.id === "externalLink";
}

const NETTBONUS_REFERRAL_URL = "https://nettbonus.no/r/28698";
const SPAREBORSEN_REFERRAL_URL = "https://spareborsen.no/ref/cmoxhkl4bhevrnv9d6uo77an5";

function rewriteNettbonusLoginTriggers(): boolean {
  const loginLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a.partnerDetailsAction[id^="loginTriggerOnDetails"]'
  );
  let found = false;
  for (const loginLink of loginLinks) {
    if (loginLink.getAttribute("href") === "/" || loginLink.getAttribute("href") === "") {
      // Clone to remove nettbonus.no's click handlers that show a login modal
      const clone = loginLink.cloneNode(true) as HTMLAnchorElement;
      clone.href = NETTBONUS_REFERRAL_URL;
      clone.target = "_blank";
      clone.removeAttribute("id");
      const adLabel = document.createElement("span");
      adLabel.textContent = "Ad";
      adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
      clone.prepend(adLabel);
      loginLink.replaceWith(clone);
      found = true;
    }
  }
  return found;
}

if (getCurrentNettbonusOfferActivationUrl() !== undefined && !rewriteNettbonusLoginTriggers()) {
  const obs = new MutationObserver(() => {
    if (rewriteNettbonusLoginTriggers()) {
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 10000);
}

if (isOnSpareborsenPartnerPage()) {
  installSpareborsenHandleButtonRewrite();
}

function isOnSpareborsenPartnerPage(): boolean {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) return false;
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "spareborsen.no" && /^\/partnere\/[^/]+/.test(parsedUrl.pathname);
}

function installSpareborsenHandleButtonRewrite(): void {
  let latestRunId = 0;

  const scheduleRewrite = (): void => {
    latestRunId += 1;
    const runId = latestRunId;
    void rewriteSpareborsenHandleButtonWhenReady(runId, () => runId !== latestRunId);
  };

  scheduleRewrite();

  const observer = new MutationObserver(() => {
    scheduleRewrite();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

async function rewriteSpareborsenHandleButtonWhenReady(
  _runId: number,
  isStale: () => boolean,
): Promise<void> {
  const state = await waitForSpareborsenAuthState(isStale);
  if (isStale() || state !== "logged-out") {
    return;
  }

  rewriteSpareborsenHandleButton();
}

type SpareborsenAuthState = "logged-in" | "logged-out" | "unknown";

async function waitForSpareborsenAuthState(isStale: () => boolean): Promise<SpareborsenAuthState> {
  const startedAt = Date.now();
  let lastState: SpareborsenAuthState = "unknown";
  let stableSince = 0;

  while (!isStale() && Date.now() - startedAt < 8000) {
    const state = getSpareborsenAuthState();
    const ready = isSpareborsenPageReady();

    if (state !== "unknown" && ready) {
      if (state !== lastState) {
        lastState = state;
        stableSince = Date.now();
      }

      if (Date.now() - stableSince >= 400) {
        return state;
      }
    } else {
      lastState = "unknown";
      stableSince = 0;
    }

    await sleep(100);
  }

  return "unknown";
}

function getSpareborsenAuthState(): SpareborsenAuthState {
  const header = document.querySelector("header");
  if (header === null) {
    return "unknown";
  }

  if (
    header.querySelector('a[href="/dashboard"], a[href="/wallet"], a[href="/dashboard/settings"]') !== null ||
    [...header.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Logg ut")
  ) {
    return "logged-in";
  }

  if (
    header.querySelector('a[href="/auth/login"], a[href="/auth/register"]') !== null ||
    [...header.querySelectorAll("button")].some((button) => {
      const text = button.textContent?.trim();
      return text === "Logg inn" || text === "Kom i gang";
    })
  ) {
    return "logged-out";
  }

  return "unknown";
}

function isSpareborsenPageReady(): boolean {
  const lbDot = document.querySelector<HTMLElement>("#lb-dot");
  if (lbDot !== null && getComputedStyle(lbDot).display !== "none") {
    return true;
  }

  return findSpareborsenHandleButton() !== null;
}

function findSpareborsenHandleButton(): HTMLButtonElement | null {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    const text = button.textContent?.replace(/^Ad\s*/i, "").trim() ?? "";
    if (text.startsWith("Handle hos") && text.endsWith("→")) {
      return button;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rewriteSpareborsenHandleButton(): boolean {
  if (getSpareborsenAuthState() !== "logged-out") {
    return false;
  }

  const handleButton = findSpareborsenHandleButton();
  if (handleButton === null || handleButton.closest("a[data-cb-rewrite]") !== null) {
    return false;
  }

  // Clone to strip React click handlers, wrap in referral link
  const clone = handleButton.cloneNode(true) as HTMLButtonElement;
  const link = document.createElement("a");
  link.href = SPAREBORSEN_REFERRAL_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.style.textDecoration = "none";
  link.setAttribute("data-cb-rewrite", "1");
  const adLabel = document.createElement("span");
  adLabel.textContent = "Ad";
  adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
  if (!clone.textContent?.trim().startsWith("Ad")) {
    clone.prepend(adLabel);
  }
  link.append(clone);
  handleButton.replaceWith(link);
  return true;
}

function getCurrentNettbonusOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "nettbonus.no") {
    return undefined;
  }

  // Detail page URLs are /details/{id}/{slug}
  if (!/^\/details\/\d+\//.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function isSpareborsenActivationClick(target: Element): boolean {
  if (getCurrentSpareborsenOfferActivationUrl() === undefined) {
    return false;
  }
  // The "Handle hos X →" button is a <button> without an <a> wrapper (when logged in)
  const clickable = target.closest<HTMLElement>("button");
  const text = clickable?.textContent?.trim() ?? "";
  return text.startsWith("Handle hos") && text.endsWith("→");
}

function getCurrentSpareborsenOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "spareborsen.no") {
    return undefined;
  }

  // Partner detail pages: /partnere/{slug}
  if (!/^\/partnere\/[^/]+/.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function isRabbleActivationClick(target: Element): boolean {
  if (getCurrentRabbleOfferActivationUrl() === undefined) {
    return false;
  }
  // If the login button is visible in the nav, user is not logged in
  if (document.querySelector('a.ph__link--login-button[href="/login"]') !== null) {
    return false;
  }
  const clickable = target.closest<HTMLElement>("button,a,[role='button']");
  if (!clickable) return false;
  return clickable.classList.contains("online-cashback-offer-cta-button") ||
    clickable.closest(".online-cashback-offer-cta") !== null;
}

function getCurrentRabbleOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "rabble.no") {
    return undefined;
  }

  // Detail page URLs are /online/{id}-{slug}
  if (!/^\/online\/\d+-/.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function getProviderActivationKey(provider: string, rawUrl: string): string | undefined {
  const normalizedUrl = normalizeActivationUrl(rawUrl);
  return normalizedUrl === undefined ? undefined : `${provider}:${normalizedUrl}`;
}

function getCurrentActivationContext(): ActivationContext {
  const chromeWithExtension = typeof chrome === "undefined"
    ? undefined
    : chrome as typeof chrome & { extension?: { inIncognitoContext?: boolean } };

  return chromeWithExtension?.extension?.inIncognitoContext === true ? "incognito" : "normal";
}

function pruneStoredActivatedOffers(
  value: unknown,
  now: number,
): { activations: Record<string, number>; changed: boolean } {
  if (!isRecord(value)) {
    return { activations: {}, changed: false };
  }

  const activations: Record<string, number> = {};
  let changed = false;
  for (const [key, activatedAt] of Object.entries(value)) {
    if (
      typeof activatedAt === "number" &&
      Number.isFinite(activatedAt) &&
      now - activatedAt >= 0 &&
      now - activatedAt < OFFER_ACTIVATION_TTL_MS
    ) {
      const parsedKey = parseActivationStorageKey(key);
      if (parsedKey === undefined) {
        changed = true;
        continue;
      }

      const storageKey = getActivationStorageKey(parsedKey.context, parsedKey.activationKey);
      activations[storageKey] = Math.max(activations[storageKey] ?? -1, activatedAt);
      if (storageKey !== key) {
        changed = true;
      }
    } else {
      changed = true;
    }
  }

  return { activations, changed };
}

function filterActivatedOffersForContext(
  activations: Readonly<Record<string, number>>,
  context: ActivationContext,
): Record<string, number> {
  const filtered: Record<string, number> = {};
  const prefix = `${context}:`;

  for (const [storageKey, activatedAt] of Object.entries(activations)) {
    if (storageKey.startsWith(prefix)) {
      filtered[storageKey.slice(prefix.length)] = activatedAt;
    }
  }

  return filtered;
}

function getActivationStorageKey(context: ActivationContext, activationKey: string): string {
  return `${context}:${activationKey}`;
}

function parseActivationStorageKey(
  storageKey: string,
): { context: ActivationContext; activationKey: string } | undefined {
  if (storageKey.startsWith("normal:")) {
    return { context: "normal", activationKey: storageKey.slice("normal:".length) };
  }

  if (storageKey.startsWith("incognito:")) {
    return { context: "incognito", activationKey: storageKey.slice("incognito:".length) };
  }

  if (storageKey.includes(":")) {
    return { context: "normal", activationKey: storageKey };
  }

  return undefined;
}

function normalizeActivationUrl(rawUrl: string): string | undefined {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    return undefined;
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  const hostname = parsedUrl.hostname.toLowerCase();
  const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
  const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/")
    ? parsedUrl.pathname.slice(0, -1)
    : parsedUrl.pathname;

  return `${protocol}//${hostname}${port}${pathname}${parsedUrl.search}`;
}

function getLocalStorageValue(key: string): Promise<unknown> {
  return new Promise((resolveValue) => {
    chrome.storage.local.get([key], (items) => {
      const value: unknown = items[key];
      resolveValue(value);
    });
  });
}

function setLocalStorageValue(key: string, value: unknown): Promise<void> {
  return new Promise((resolveValue) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolveValue();
    });
  });
}

function renderNotice(
  offers: CashbackOffer[],
  initialCollapsed: boolean,
  initialChipsCollapsed: boolean,
  initialCodesCollapsed: boolean,
  initialPriceMatchCollapsed: boolean,
  initialRegionPricesCollapsed: boolean,
  activatedOffers: Readonly<Record<string, number>>,
  priceMatches: PriceMatchOffer[] = [],
  regionPrices?: PlayStationRegionPriceResult,
): void {
  clearNotice();
  const host = document.createElement("div");
  host.id = HOST_ID;
  applyHostOverlayStyle(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      background: transparent;
      border: 0;
      bottom: 16px;
      box-sizing: border-box;
      display: block;
      height: 0;
      inset: auto auto 16px 0;
      left: 0;
      margin: 0;
      overflow: visible;
      padding: 0;
      position: fixed;
      width: 0;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    *, *::before, *::after {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .notice {
      display: flex;
      align-items: flex-end;
      bottom: 16px;
      left: 0;
      max-width: 100vw;
      position: fixed;
      width: max-content;
      z-index: 2147483647;
    }
    .side-tab {
      appearance: none;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-left: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 4px 12px rgba(11, 25, 34, 0.12);
      color: #172026;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font: inherit;
      min-height: 40px;
      padding: 8px 5px;
      width: 26px;
      flex-shrink: 0;
      transition: min-height 0.25s ease, padding 0.25s ease;
    }
    .side-tab:hover {
      background: #f7faf8;
    }
    .side-tab-arrow {
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      display: block;
    }
    .side-tab-text {
      display: none;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      transform: rotate(180deg);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      color: #172026;
      letter-spacing: 0.02em;
      margin-top: 6px;
      align-items: center;
      gap: 4px;
    }
    .side-tab-reward {
      color: #172026;
    }
    .side-tab-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab {
      min-height: 80px;
      padding: 10px 5px;
    }
    .notice.collapsed .side-tab-arrow {
      display: none;
    }
    .notice.collapsed .side-tab-text {
      display: flex;
    }
    .panel {
      width: min(400px, calc(100vw - 70px));
      max-height: min(80vh, 760px);
      color: #172026;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(11, 25, 34, 0.2);
      overflow: hidden auto;
      overscroll-behavior: contain;
      margin-left: 4px;
      transform: translateZ(0);
      transition: width 0.25s ease, opacity 0.25s ease, margin-left 0.25s ease, border-width 0.25s ease;
    }
    .notice.collapsed .panel {
      width: 0;
      opacity: 0;
      margin-left: 0;
      border-width: 0;
      pointer-events: none;
    }
    .notice.no-transition .panel,
    .notice.no-transition .side-tab {
      transition: none;
    }
    .topline {
      height: 4px;
      background: linear-gradient(90deg, #1f8f5f, #f4b942);
    }
    .body {
      display: grid;
      align-content: start;
      gap: 10px;
      padding: 14px 14px 0 14px;
    }
    .header {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      min-height: 32px;
    }
    .sum-input {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      font-family: inherit;
      font-size: 12px;
      height: 26px;
      outline: none;
      padding: 0 6px;
      text-align: right;
      width: 68px;
    }
    .sum-input:focus {
      border-color: #1f8f5f;
    }
    .sum-input::placeholder {
      color: #8a9a92;
      font-size: 11px;
    }
    .site-icon {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 6px;
      height: 24px;
      object-fit: contain;
      padding: 3px;
      width: 24px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .offer-list {
      display: grid;
      align-content: start;
      gap: 4px;
    }
    .offer-link.offer-link--best {
      color: #3a7d55;
    }
    .offer-link {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 14px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 5px 9px;
      text-decoration: none;
    }
    .offer-link .provider-badge {
      grid-column: 3;
    }
    .provider-wrap {
      align-items: center;
      display: inline-flex;
      gap: 5px;
      grid-column: 3;
      justify-content: flex-end;
      min-width: 0;
    }
    .activation-badge {
      align-items: center;
      background: #eaf7ef;
      border: 1px solid #a9d9bd;
      border-radius: 4px;
      color: #166b47;
      display: inline-flex;
      flex-shrink: 0;
      height: 18px;
      justify-content: center;
      line-height: 1;
      width: 18px;
    }
    .activation-badge svg {
      flex-shrink: 0;
      height: 12px;
      width: 12px;
    }
    .offer-label {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      font-size: 14px;
      font-weight: 700;
      gap: 6px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .provider-badge {
      align-items: center;
      border-radius: 5px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      min-height: 20px;
      padding: 0 6px;
      white-space: nowrap;
    }
    .provider-remember {
      background: #111111;
      color: #ff9900;
    }
    .provider-klarna {
      background: #ffa8cd;
      color: #0b051d;
    }
    .provider-trumf {
      background: #07006b;
      color: #ffffff;
    }
    .provider-sas {
      background: #00005c;
      color: #ffffff;
    }
    .provider-tfbank {
      background: #e30613;
      color: #ffffff;
    }
    .provider-dnb {
      background: #14555a;
      color: #ffffff;
    }
    .provider-curve {
      background: #000000;
      color: #ffffff;
    }
    .provider-crypto {
      background: #002d74;
      color: #ffffff;
    }
    .provider-rabattkode {
      background: #e74c3c;
      color: #ffffff;
    }
    .provider-norskfamilie {
      background: #ff6600;
      color: #ffffff;
    }
    .provider-revolut {
      background: #0666eb;
      color: #ffffff;
    }
    .provider-norwegian {
      background: #d81939;
      color: #ffffff;
    }
    .provider-logbuy {
      background: #d81939;
      color: #ffffff;
    }
    .provider-obos {
      background: #003087;
      color: #ffffff;
    }
    .provider-bob {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #5b2486;
    }
    .provider-usbl {
      background: #34413e;
      color: #ffffff;
    }
    .provider-bate {
      background: #ffffff;
      border: 1px solid #ef1c24;
      color: #ef1c24;
    }
    .provider-tobb {
      background: #00466b;
      color: #ffffff;
    }
    .provider-naf {
      background: #FFD100;
      color: #000000;
    }
    .provider-tekna {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #00a3ad;
    }
    .provider-nito {
      background: #c8e6b8;
      color: #003b00;
    }
    .provider-prisjakt {
      background: #00a9ce;
      color: #ffffff;
    }
    .provider-godpris {
      background: #21003f;
      color: #ffffff;
    }
    .provider-prisradar {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #0c4598;
    }
    .provider-sesum {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      color: #111827;
    }
    .provider-enhver {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      color: #162333;
    }
    .provider-kassal {
      background: #c8103a;
      color: #ffffff;
    }
    .provider-finnreise {
      background: #06befb;
      color: #ffffff;
    }
    .provider-panflights {
      background: #ffffff;
      border: 1px solid #d7e5ff;
      color: #1375f7;
    }
    .provider-momondo {
      background: #2e0b59;
      color: #ff7a18;
    }
    .provider-skyscanner {
      background: #05203c;
      color: #ffffff;
    }
    .provider-travellink {
      background: #006471;
      color: #ffffff;
    }
    .provider-tripcom {
      background: #2563eb;
      color: #ffffff;
    }
    .provider-isthereanydeal {
      background: #2d2f42;
      color: #ffffff;
    }
    .provider-gcdeals {
      background: #341083;
      color: #ffffff;
    }
    .provider-ggdeals {
      background: #111018;
      color: #ffffff;
    }
    .provider-allkeyshop {
      background: #070b12;
      color: #ffffff;
    }
    .provider-appstoreprice {
      background: #007aff;
      color: #ffffff;
    }
    .provider-psprices {
      background: #2b2927;
      color: #ffffff;
      font-variant-caps: normal;
      text-transform: none;
    }
    .provider-taxfree {
      background: #e3000f;
      color: #ffffff;
    }
    .provider-vinmonopolet {
      background: #dff4eb;
      color: #092f33;
    }
    .provider-region {
      background: #eaf7ef;
      color: #166b47;
    }
    .provider-sparebank1 {
      background: #005aa4;
      color: #ffffff;
    }
    .provider-studentkortet {
      background: #1B2838;
      color: #ffffff;
    }
    .provider-studenttorget {
      background: #009fe3;
      color: #ffffff;
    }
    .provider-nettbonus {
      background: #5b0f8c;
      color: #ffffff;
    }
    .provider-spenn {
      background: #E51454;
      color: #ffffff;
    }
    .provider-spareborsen {
      background: #C9A24A;
      color: #1A1A1A;
    }
    .provider-rabble {
      background: #2d2145;
      color: #f8a6a6;
    }
    .provider-dreams {
      background: #a389d8;
      color: #1a1a1a;
    }
    .provider-utdanningibergen {
      background: #ffffff;
      color: #000000;
      border: 1px solid #ccc;
    }
    .provider-unidays {
      background: #00b140;
      color: #ffffff;
    }
    .provider-cbn {
      background: #f7d7e6;
      color: #8f164f;
    }
    .provider-unio {
      background: #ffffff;
      border: 1px solid #c9b896;
      color: #6b5330;
    }
    .provider-sas-amex {
      background: #00005c;
      color: #ffffff;
    }
    .provider-lunar {
      background: #2bb24c;
      color: #ffffff;
    }
    .copy-code-btn {
      align-items: center;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      padding: 4px;
      border-radius: 4px;
      position: relative;
    }
    .copy-code-btn:hover {
      color: #166b47;
    }
    .vote-btn {
      align-items: center;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      gap: 3px;
      padding: 4px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1;
      background: none;
      border: none;
    }
    .vote-btn:hover {
      color: #1f8f5f;
    }
    .vote-btn.voted {
      color: #1f8f5f;
    }
    .vote-btn.downvoted {
      color: #e05555;
    }
    .vote-count {
      font-size: 11px;
      font-weight: 600;
    }
    .add-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      margin-left: auto;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
    }
    .add-code-btn:hover {
      color: #1f8f5f;
    }
    .add-code-form {
      align-items: center;
      display: flex;
      gap: 6px;
      padding: 2px 0;
    }
    .add-code-form-inner {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d0dbd5;
      border-radius: 6px;
      display: flex;
      flex: 1;
      gap: 4px;
      min-width: 0;
      padding: 3px 6px;
    }
    .add-code-input {
      background: transparent;
      border: none;
      color: #172026;
      flex: 1;
      font-size: 12px;
      min-width: 0;
      padding: 4px 2px;
      font-family: inherit;
      outline: none;
    }
    .add-reward-input {
      flex: 0 0 48px;
      border-right: 1px solid #d0dbd5;
      padding-right: 6px;
    }
    .add-code-submit {
      align-items: center;
      background: none;
      border: none;
      border-radius: 4px;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      padding: 4px;
      flex-shrink: 0;
    }
    .add-code-submit:disabled {
      color: #b0c8bc;
      cursor: default;
    }
    .add-code-cancel {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      font-size: 14px;
      height: 22px;
      justify-content: center;
      padding: 0;
      width: 22px;
    }
    .add-code-cancel:hover {
      color: #172026;
    }
    .add-code-thanks {
      color: #1f8f5f;
      font-size: 11px;
      margin: 0;
      padding: 4px 0;
    }
    .delete-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0bec5;
      cursor: pointer;
      display: inline-flex;
      padding: 2px 3px;
      border-radius: 4px;
      flex-shrink: 0;
      font-size: 13px;
      line-height: 1;
    }
    .delete-code-btn:hover {
      color: #e05555;
    }
    .expired-section {
      margin-top: 4px;
      padding-top: 4px;
    }
    .expired-toggle {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: flex;
      font-size: 11px;
      gap: 4px;
      padding: 2px 0;
      width: 100%;
    }
    .expired-toggle:hover {
      color: #172026;
    }
    .expired-toggle-arrow {
      display: inline-block;
      font-size: 9px;
      transition: transform 0.15s;
    }
    .expired-section.collapsed .expired-toggle-arrow {
      transform: rotate(-90deg);
    }
    .expired-list {
      display: grid;
      gap: 4px;
      margin-top: 4px;
    }
    .expired-section.collapsed .expired-list {
      display: none;
    }
    .code-item.expired {
      opacity: 0.55;
    }
    .copy-code-tooltip {
      background: #1a1a2e;
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.3;
      padding: 5px 8px;
      pointer-events: none;
      position: fixed;
      white-space: nowrap;
      z-index: 2147483647;
      display: none;
    }
    .copy-code-tooltip.visible {
      display: block;
    }
    .bonus-chips {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chip-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .chip-group-label {
      color: #8a9a92;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .chip-group-items {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .bonus-chips-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .bonus-chips-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
    }
    .bonus-chips-toggle:hover {
      color: #4f5f66;
    }
    .bonus-chips-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .bonus-chips-section.collapsed .bonus-chips {
      display: none;
    }
    .bonus-chips-section.collapsed,
    .codes-section.collapsed,
    .price-match-section.collapsed {
      padding-bottom: 0;
    }
    .bonus-chips-section.collapsed .bonus-chips-toggle,
    .codes-section.collapsed .codes-toggle,
    .price-match-section.collapsed .price-match-toggle,
    .region-prices-section.collapsed .region-prices-toggle {
      margin-bottom: 0;
    }
    .bonus-chips-section.collapsed .bonus-chips-toggle-arrow {
      transform: rotate(-90deg);
    }
    .codes-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .codes-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .codes-toggle:hover {
      color: #4f5f66;
    }
    .codes-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .codes-section.collapsed .codes-list {
      display: none;
    }
    .codes-section.collapsed .expired-section {
      display: none !important;
    }
    .codes-section.collapsed .codes-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-section,
    .region-prices-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .price-match-toggle,
    .region-prices-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .price-match-toggle:hover,
    .region-prices-toggle:hover {
      color: #4f5f66;
    }
    .price-match-toggle-arrow,
    .region-prices-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .price-match-section.collapsed .price-match-card {
      display: none;
    }
    .region-prices-section.collapsed .region-price-card {
      display: none;
    }
    .price-match-section.collapsed .price-match-toggle-arrow,
    .region-prices-section.collapsed .region-prices-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-card,
    .region-price-card {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 12px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 6px 9px;
      text-decoration: none;
    }
    .region-price-card {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .region-price-card-with-action {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .region-price-main {
      color: inherit;
      display: contents;
      text-decoration: none;
    }
    .region-price-action {
      justify-self: end;
      text-decoration: none;
      white-space: nowrap;
    }
    .region-price-actions {
      align-items: center;
      display: inline-flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: flex-end;
      justify-self: end;
      min-width: 0;
    }
    .price-match-card.price-match-card--best .price-match-product,
    .price-match-card.price-match-card--best .price-match-price,
    .region-price-card.region-price-card--best .region-price-country,
    .region-price-card.region-price-card--best .region-price-nok {
      color: #3a7d55;
    }
    .price-match-card + .price-match-card,
    .region-price-card + .region-price-card {
      margin-top: 4px;
    }
    .price-match-title,
    .region-price-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .price-match-product,
    .region-price-country {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-shop,
    .region-price-native {
      color: #5d6b71;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-price,
    .region-price-nok {
      color: #172026;
      font-weight: 800;
      white-space: nowrap;
    }
    .codes-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .code-item-row {
      align-items: center;
      display: flex;
      gap: 6px;
    }
    .code-item {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      display: flex;
      flex: 1;
      font-size: 12px;
      gap: 6px;
      min-width: 0;
      padding: 5px 9px;
    }
    .code-reward {
      font-weight: 700;
      white-space: nowrap;
    }
    .code-item-row--best .code-reward,
    .code-item-row--best .code-value {
      color: #3a7d55;
    }
    .code-value {
      color: #5d6b71;
      font-family: monospace;
      font-size: 11px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .code-copy-group {
      align-items: center;
      display: inline-flex;
      flex: 1 1 auto;
      gap: 4px;
      min-width: 0;
    }
    .code-source-badge {
      flex-shrink: 0;
      font-size: 11px;
      min-height: 22px;
      text-decoration: none;
    }
    .bonus-chip {
      align-items: center;
      background: #f0f4f2;
      border: 1px solid #d8e3de;
      border-radius: 20px;
      color: #172026;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      gap: 4px;
      line-height: 1;
      padding: 5px 10px;
      text-decoration: none;
      white-space: nowrap;
    }
    .bonus-chip:hover {
      background: #e4ebe7;
    }
    .bonus-chip--best {
      color: #3a7d55;
    }
    .bonus-chip-label {
      font-weight: 800;
    }
    .bonus-chip .provider-badge {
      font-size: 9px;
      min-height: 16px;
      padding: 0 5px;
    }
    .bonus-chip-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-height: min(70vh, 560px);
      max-width: 320px;
      overflow: hidden;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
      display: none;
    }
    .bonus-chip-tooltip.visible {
      display: block;
    }
    .offer-link-wrapper {
      position: relative;
    }
    .card-only-warn {
      color: #b0bec5;
      cursor: help;
      font-size: 11px;
      line-height: 1;
      user-select: none;
    }
    .app-chip {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      color: #78909c;
      border: 1px solid #78909c;
      border-radius: 3px;
      padding: 0 3px;
      margin-right: 4px;
      vertical-align: middle;
      line-height: 14px;
      white-space: nowrap;
      cursor: help;
    }
    .offer-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 320px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: normal;
      width: max-content;
      z-index: 2147483647;
    }
    .offer-tooltip-section + .offer-tooltip-section {
      margin-top: 8px;
    }
    .offer-tooltip-section + .offer-tooltip-section:has(.offer-tooltip-list) {
      margin-top: 14px;
    }
    .offer-tooltip-title {
      display: block;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .offer-tooltip-text {
      display: block;
      white-space: pre-line;
    }
    .offer-tooltip-list {
      display: grid;
      gap: 4px;
      list-style: disc;
      margin: 0;
      padding-left: 16px;
    }
    .offer-tooltip-list li {
      padding-left: 2px;
    }
    .offer-tooltip.visible {
      display: block;
    }
    .support {
      padding: 6px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .support a {
      color: #8a9a92;
      font-size: 11px;
      line-height: 1.35;
      text-decoration: none;
    }
    .support a:hover {
      color: #4f5f66;
      text-decoration: underline;
    }
    .support-logo {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      opacity: 0.7;
    }
    .support-logo:hover {
      opacity: 1;
    }
    .conflict-warning {
      color: #d4830a;
      cursor: help;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: 4px;
      vertical-align: middle;
    }
    .status-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 280px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
    }
    .status-tooltip.visible {
      display: block;
    }
  `;
  const mainOffers = offers.filter((o) => o.provider !== "curve" && o.provider !== "rabattkode" && o.provider !== "dnb" && o.provider !== "tfbank");
  const activeOfferKey = getLastActivatedOfferKey(mainOffers, activatedOffers);
  const priceMatch = priceMatches[0];
  const bestRegionPrice = regionPrices?.prices[0];
  const curveOffer = offers.find((o) => o.provider === "curve");
  const CARD_ONLY_PROVIDERS = new Set(["sparebank1", "remember", "tfbank"]);
  const APP_ONLY_PROVIDERS = new Set(["klarna", "spenn", "dreams"]);
  const CRYPTO_SUBSCRIPTIONS: Record<string, string> = {
    "spotify.com": "Spotify",
    "netflix.com": "Netflix",
    "truthsocial.com": "Truth+",
  };
  const currentHost = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const cryptoSubEntry = Object.entries(CRYPTO_SUBSCRIPTIONS).find(([d]) => currentHost === d || currentHost.endsWith(`.${d}`));
  const cryptoSub = cryptoSubEntry?.[1];
  const codeOffers = offers.filter((o) => o.provider === "rabattkode" || (o.discountCode !== undefined && o.discountCode.length > 0));
  const offer = mainOffers[0];
  if (offer === undefined && codeOffers.length === 0 && priceMatch === undefined && bestRegionPrice === undefined) {
    return;
  }
  const primaryOffer = offer ?? codeOffers[0];
  if (primaryOffer === undefined && priceMatch === undefined && bestRegionPrice === undefined) {
    return;
  }
  const notice = document.createElement("section");
  notice.className = "notice";
  const sideTabProvider = offer?.provider ?? (primaryOffer !== undefined ? getCodeSourceProvider(primaryOffer) : undefined) ?? (priceMatch !== undefined ? getPriceMatchProviderClass(priceMatch) : "region");
  // Side tab (collapse/expand control on the left edge)
  const sideTab = document.createElement("button");
  sideTab.className = `side-tab side-tab-${sideTabProvider}`;
  sideTab.type = "button";
  sideTab.setAttribute("aria-label", "Collapse cashback offers");
  const sideTabArrow = document.createElement("span");
  sideTabArrow.className = "side-tab-arrow";
  sideTabArrow.textContent = "\u2039"; // ‹
  const sideTabText = document.createElement("span");
  sideTabText.className = "side-tab-text";
  if (offer !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
    const chipSpan = document.createElement("span");
    chipSpan.className = `side-tab-chip provider-${offer.provider}`;
    chipSpan.textContent = formatProviderName(offer.provider);
    sideTabText.append(rewardSpan, chipSpan);
  } else if (primaryOffer !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = formatCompactRewardLabel(primaryOffer) ?? primaryOffer.reward;
    sideTabText.append(rewardSpan);
    const codeProvider = getCodeSourceProvider(primaryOffer);
    if (codeProvider !== undefined) {
      const chipSpan = document.createElement("span");
      chipSpan.className = `side-tab-chip provider-${codeProvider}`;
      chipSpan.textContent = formatProviderName(codeProvider);
      sideTabText.append(chipSpan);
    }
  } else if (priceMatch !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = priceMatch.price;
    const chipSpan = document.createElement("span");
    chipSpan.className = `side-tab-chip provider-${getPriceMatchProviderClass(priceMatch)}`;
    chipSpan.textContent = getPriceMatchSourceName(priceMatch);
    sideTabText.append(rewardSpan, chipSpan);
  } else if (bestRegionPrice !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = bestRegionPrice.formattedNok;
    const chipSpan = document.createElement("span");
    chipSpan.className = "side-tab-chip provider-region";
    chipSpan.textContent = `${bestRegionPrice.flag} Region`;
    sideTabText.append(rewardSpan, chipSpan);
  }
  sideTab.append(sideTabArrow, sideTabText);
  sideTab.addEventListener("click", () => {
    const isCollapsed = notice.classList.contains("collapsed");
    setCollapsed(notice, sideTab, sideTabArrow, !isCollapsed);
  });
  // Main panel
  const panel = document.createElement("div");
  panel.className = "panel";
  const topLine = document.createElement("div");
  topLine.className = "topline";
  const body = document.createElement("div");
  body.className = "body";
  const header = document.createElement("div");
  header.className = "header";
  const siteIcon = createSiteIcon();
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = offer !== undefined
    ? `${formatOfferTitlePrefix(offer)} hos ${offer.merchantName}`
      : primaryOffer !== undefined
        ? `Rabattkode hos ${primaryOffer.merchantName}`
      : priceMatch !== undefined
        ? `Prismatch hos ${priceMatch.shopName}`
        : "Regionpriser";
  header.append(siteIcon, title);
  const sumInput = document.createElement("input");
  sumInput.className = "sum-input";
  sumInput.type = "text";
  sumInput.inputMode = "decimal";
  sumInput.placeholder = "Sum";
  sumInput.addEventListener("keydown", (e) => {
    if (e.key.length === 1 && !/[0-9.,]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });
  header.append(sumInput);
  const rewardLabels: { element: HTMLSpanElement; offer: CashbackOffer }[] = [];
  const tooltipElements: { element: HTMLDivElement; offer: CashbackOffer }[] = [];
  const offerList = document.createElement("div");
  offerList.className = "offer-list";
  for (const [offerIdx, currentOffer] of mainOffers.entries()) {
    const wrapper = document.createElement("div");
    wrapper.className = "offer-link-wrapper";
    const offerLink = document.createElement("a");
    const isBestOffer = offerIdx === 0;
    offerLink.className = isBestOffer ? "offer-link offer-link--best" : "offer-link";
    offerLink.href = currentOffer.provider === "trumf" || currentOffer.provider === "klarna" ? currentOffer.sourceUrl : currentOffer.activationUrl;
    offerLink.target = "_blank";
    offerLink.rel = "noreferrer";
    const offerLabel = document.createElement("span");
    offerLabel.className = "offer-label";
    const offerReward = document.createElement("span");
    offerReward.textContent = formatRewardLabel(currentOffer.reward, currentOffer.provider);
    rewardLabels.push({ element: offerReward, offer: currentOffer });
    const providerWrap = createProviderBadgeWithActivation(currentOffer, activeOfferKey, shadowRoot);
    if (currentOffer.provider === "nettbonus" || currentOffer.provider === "spareborsen") {
      const adChip = makeAdChip();
      providerWrap.prepend(adChip);
    }
    offerLabel.append(offerReward);
    if (currentOffer.discountCode !== undefined) {
      const code = currentOffer.discountCode;
      const copyBtn = document.createElement("span");
      copyBtn.className = "copy-code-btn";
      copyBtn.innerHTML = COPY_ICON_SVG;
      const copyTooltip = document.createElement("div");
      copyTooltip.className = "copy-code-tooltip";
      copyTooltip.textContent = `Kopier rabattkode: ${code}`;
      shadowRoot.append(copyTooltip);
      copyBtn.addEventListener("mouseenter", () => {
        const rect = copyBtn.getBoundingClientRect();
        copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
        copyTooltip.style.top = `${rect.top - 30}px`;
        copyTooltip.style.transform = "translateX(-50%)";
        copyTooltip.classList.add("visible");
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyTooltip.classList.remove("visible");
      });
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.innerHTML = CHECK_ICON_SVG;
          copyTooltip.textContent = "Kopiert!";
          copyTooltip.classList.add("visible");
          setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyTooltip.textContent = `Kopier rabattkode: ${code}`;
            copyTooltip.classList.remove("visible");
          }, 1500);
        });
      });
      offerLink.append(offerLabel, copyBtn, providerWrap);
    } else if (CARD_ONLY_PROVIDERS.has(currentOffer.provider)) {
      const warnIcon = document.createElement("span");
      warnIcon.className = "card-only-warn";
      warnIcon.textContent = "⚠";
      offerLink.append(offerLabel, warnIcon, providerWrap);
    } else if (APP_ONLY_PROVIDERS.has(currentOffer.provider)) {
      const appChip = document.createElement("span");
      appChip.className = "app-chip";
      appChip.textContent = "App";
      offerLink.append(offerLabel, appChip, providerWrap);
    } else {
      offerLink.append(offerLabel, providerWrap);
    }
    wrapper.append(offerLink);
    offerList.append(wrapper);
  }
  sumInput.addEventListener("input", () => {
    const raw = sumInput.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    const amount = raw.length > 0 ? Number.parseFloat(raw) : 0;
    for (const el of shadowRoot.querySelectorAll<HTMLElement>(".code-reward[data-pct]")) {
      const pct = parseFloat(el.dataset.pct ?? "0");
      if (!el.dataset.origReward) el.dataset.origReward = el.textContent ?? "";
      const orig = el.dataset.origReward;
      if (pct > 0 && amount > 0) {
        el.textContent = `${Math.round(amount * pct / 100)} kr`;
      } else {
        el.textContent = orig;
      }
    }
    for (const { element, offer } of rewardLabels) {
      if (amount > 0) {
        const result = calculateCashback(offer, amount);
        element.textContent = result !== "" ? result : formatRewardLabel(offer.reward, offer.provider);
      } else {
        element.textContent = formatRewardLabel(offer.reward, offer.provider);
      }
    }
    for (const { element, offer } of tooltipElements) {
      const fullReward = formatRewardLabel(offer.reward, offer.provider);
      const compact = formatCompactRewardLabel(offer);
      const showRewardInTooltip = compact !== undefined && fullReward !== compact && !fullReward.startsWith(compact);
      const breakdown = amount > 0 ? formatBreakdownWithAmounts(offer.terms, amount) : offer.terms;
      const parts: string[] = [];
      if (breakdown) parts.push(breakdown);
      setTooltipContent(element, parts);
    }
    for (const { element, pct, minPct, maxPct, ebPer100kr, approx, defaultText } of bonusChipLabels) {
      if (amount > 0 && minPct != null && maxPct != null) {
        element.textContent = `+${formatKr(amount * minPct / 100)}-${formatKr(amount * maxPct / 100)} kr`;
      } else if (amount > 0) {
        const kr = formatKr(amount * pct / 100);
        if (ebPer100kr != null) {
          const eb = Math.round(amount * ebPer100kr / 100);
          element.textContent = `+~${kr} kr (~${eb} EB)`;
        } else {
          element.textContent = `+${approx ? "~" : ""}${kr} kr`;
        }
      } else {
        element.textContent = defaultText;
      }
    }
    chipsToggleText.textContent = "Ekstra cashback";
  });
  const bonusChipLabels: { element: HTMLSpanElement; pct: number; minPct?: number; maxPct?: number; ebPer100kr?: number; approx: boolean; defaultText: string }[] = [];
  const bonusChips = document.createElement("div");
  bonusChips.className = "bonus-chips";
  // --- Free chips group (left) ---
  const freeGroup = document.createElement("div");
  freeGroup.className = "chip-group";
  const freeLabel = document.createElement("span");
  freeLabel.className = "chip-group-label";
  freeLabel.textContent = "Gratis";
  const freeItems = document.createElement("div");
  freeItems.className = "chip-group-items";
  freeGroup.append(freeLabel, freeItems);
  function createBonusChip(card: typeof FREE_CARDS[number], overrideUrl?: string): { chip: HTMLAnchorElement; label: HTMLSpanElement } {
    const chip = document.createElement("a");
    chip.className = "bonus-chip";
    chip.href = overrideUrl ?? card.url;
    chip.target = "_blank";
    chip.rel = "noreferrer";
    const label = document.createElement("span");
    label.className = "bonus-chip-label";
    const ebInfo = card.ebPer100kr ? ` (~${card.ebPer100kr} EB/100kr)` : "";
    const pctStr = (card.minPct != null && card.maxPct != null)
      ? `${(card.minPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}-${(card.maxPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}`
      : (card.pct * 100).toFixed(2).replace(".", ",").replace(/0$/, "");
    label.textContent = `+${card.approx ? "~" : ""}${pctStr} %${ebInfo}`;
    const badge = document.createElement("span");
    badge.className = `provider-badge provider-${card.badge}`;
    badge.textContent = card.label;
    chip.append(label, badge);
    return { chip, label };
  }
  const firstOfferIsCardOnly = mainOffers.length > 0 && CARD_ONLY_PROVIDERS.has(mainOffers[0]!.provider);
  for (const [cardIdx, card] of FREE_CARDS.entries()) {
    const { chip, label } = createBonusChip(card);
    if (cardIdx === 0 && !firstOfferIsCardOnly) chip.classList.add("bonus-chip--best");
    bonusChipLabels.push({ element: label, pct: card.pct * 100, ...(card.minPct != null ? { minPct: card.minPct * 100 } : {}), ...(card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}), ...(card.ebPer100kr !== undefined ? { ebPer100kr: card.ebPer100kr } : {}), approx: card.approx, defaultText: label.textContent ?? "" });
    freeItems.append(chip);
    addChipTooltip(chip, card.tip, shadowRoot);
  }
  bonusChips.append(freeGroup);
  // --- Premium chips group (right) ---
  const premiumGroup = document.createElement("div");
  premiumGroup.className = "chip-group";
  const premiumLabel = document.createElement("span");
  premiumLabel.className = "chip-group-label";
  premiumLabel.textContent = "Premium";
  const premiumItems = document.createElement("div");
  premiumItems.className = "chip-group-items";
  premiumGroup.append(premiumLabel, premiumItems);
  const currentHostname = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const revolutSub = REVOLUT_SUBSCRIPTIONS[currentHostname];
  if (revolutSub !== undefined) {
    const revolutChip = document.createElement("a");
    revolutChip.className = "bonus-chip";
    revolutChip.href = "https://revolut.com/referrals?r=FELPJK";
    revolutChip.target = "_blank";
    revolutChip.rel = "noreferrer";
    const revolutLabel = document.createElement("span");
    revolutLabel.className = "bonus-chip-label";
    revolutLabel.textContent = "Inkludert";
    const revolutBadge = document.createElement("span");
    revolutBadge.className = "provider-badge provider-revolut";
    revolutBadge.textContent = "Revolut";
    revolutChip.append(revolutLabel, revolutBadge);
    premiumItems.append(revolutChip);
    addChipTooltip(revolutChip, `${revolutSub}\nInkludert i Premium (95 kr/mnd), Metal (170 kr/mnd) eller Ultra (700 kr/mnd)`, shadowRoot);
  }
  for (const card of PREMIUM_CARDS) {
    if (card.label === "Crypto" && cryptoSub !== undefined) continue;
    const { chip, label } = createBonusChip(card, card.label === "Curve" ? curveOffer?.activationUrl : undefined);
    if (card.label === "Crypto" || card.label === "Curve") {
      const badge = chip.querySelector(".provider-badge")!;
      const wrapper = document.createElement("span");
      wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      badge.replaceWith(wrapper);
      wrapper.append(makeAdChip(), badge);
    }
    bonusChipLabels.push({ element: label, pct: card.pct * 100, ...(card.minPct != null ? { minPct: card.minPct * 100 } : {}), ...(card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}), approx: card.approx, defaultText: label.textContent ?? "" });
    premiumItems.append(chip);
    addChipTooltip(chip, card.tip, shadowRoot);
  }
  bonusChips.append(premiumGroup);
  // --- Selected retailers group ---
  const selectedGroup = document.createElement("div");
  selectedGroup.className = "chip-group";
  const selectedLabel = document.createElement("span");
  selectedLabel.className = "chip-group-label";
  selectedLabel.textContent = "Premium for enkelte butikker";
  const selectedItems = document.createElement("div");
  selectedItems.className = "chip-group-items";
  selectedGroup.append(selectedLabel, selectedItems);
  let hasSelectedItems = false;
  if (cryptoSub !== undefined) {
    const cryptoChip = document.createElement("a");
    cryptoChip.className = "bonus-chip";
    cryptoChip.href = "https://crypto.com/app/ns3fma5hou";
    cryptoChip.target = "_blank";
    cryptoChip.rel = "noreferrer";
    const cryptoChipLabel = document.createElement("span");
    cryptoChipLabel.className = "bonus-chip-label";
    cryptoChipLabel.textContent = "3-6 mnd gratis";
    const cryptoBadge = document.createElement("span");
    cryptoBadge.className = "provider-badge provider-crypto";
    cryptoBadge.textContent = "Crypto";
    cryptoChip.append(cryptoChipLabel, cryptoBadge);
    const cryptoAdWrapper = document.createElement("span");
    cryptoAdWrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    cryptoBadge.replaceWith(cryptoAdWrapper);
    cryptoAdWrapper.append(makeAdChip(), cryptoBadge);
    addChipTooltip(cryptoChip, `Crypto.com Visa-kort.\nJade/Obsidian: 6 mnd gratis ${cryptoSub}\nPlatin: 3 mnd gratis ${cryptoSub}`, shadowRoot);
    selectedItems.append(cryptoChip);
    hasSelectedItems = true;
  }
  if (hasSelectedItems) bonusChips.append(selectedGroup);
  // Collapsible chips section
  const chipsSection = document.createElement("div");
  chipsSection.className = "bonus-chips-section";
  if (initialChipsCollapsed) {
    chipsSection.classList.add("collapsed");
  }
  const chipsToggle = document.createElement("button");
  chipsToggle.className = "bonus-chips-toggle";
  chipsToggle.type = "button";
  const chipsToggleArrow = document.createElement("span");
  chipsToggleArrow.className = "bonus-chips-toggle-arrow";
  chipsToggleArrow.textContent = "\u25BC";
  const chipsToggleText = document.createElement("span");
  chipsToggleText.textContent = "Ekstra cashback";
  chipsToggle.append(chipsToggleArrow, chipsToggleText);
  chipsToggle.addEventListener("click", () => {
    const isCollapsed = chipsSection.classList.toggle("collapsed");
    chrome.storage.local.set({ [CHIPS_COLLAPSED_KEY]: isCollapsed });
  });
  chipsSection.append(chipsToggle, bonusChips);
  // --- Rabattkoder section ---
  const codesSection = document.createElement("div");
  codesSection.className = "codes-section";
  if (initialCodesCollapsed && codeOffers.length > 0) {
    codesSection.classList.add("collapsed");
  }

  // Header row: "▼ Rabattkoder (N)" + "+" button
  const codesToggle = document.createElement("button");
  codesToggle.className = "codes-toggle";
  codesToggle.type = "button";
  const codesToggleArrow = document.createElement("span");
  codesToggleArrow.className = "codes-toggle-arrow";
  codesToggleArrow.textContent = "\u25BC";
  const codesToggleText = document.createElement("span");
  codesToggleText.textContent = "Rabattkoder";
  const addCodeBtn = document.createElement("button");
  addCodeBtn.className = "add-code-btn";
  addCodeBtn.type = "button";
  addCodeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const addCodeTooltip = document.createElement("div");
  addCodeTooltip.className = "copy-code-tooltip";
  addCodeTooltip.textContent = "Legg til rabattkode";
  shadowRoot.append(addCodeTooltip);
  addCodeBtn.addEventListener("mouseenter", () => {
    const rect = addCodeBtn.getBoundingClientRect();
    addCodeTooltip.style.left = `${rect.left + rect.width / 2}px`;
    addCodeTooltip.style.top = `${rect.top - 30}px`;
    addCodeTooltip.style.transform = "translateX(-50%)";
    shadowRoot.append(addCodeTooltip); // re-append to ensure paint order on top
    addCodeTooltip.classList.add("visible");
  });
  addCodeBtn.addEventListener("mouseleave", () => { addCodeTooltip.classList.remove("visible"); });
  codesToggle.append(codesToggleArrow, codesToggleText, addCodeBtn);
  codesToggle.addEventListener("click", (e) => {
    if (addCodeBtn.contains(e.target as Node)) return;
    const isCollapsed = codesSection.classList.toggle("collapsed");
    chrome.storage.local.set({ [CODES_COLLAPSED_KEY]: isCollapsed });
    if (!isCollapsed) loadDbCodes();
  });

  const codesList = document.createElement("div");
  codesList.className = "codes-list";

  // Inline add-code form (hidden by default, appears at top of list)
  const addCodeForm = document.createElement("div");
  addCodeForm.className = "add-code-form";
  addCodeForm.style.display = "none";
  const addRewardInput = document.createElement("input");
  addRewardInput.className = "add-code-input add-reward-input";
  addRewardInput.type = "number";
  addRewardInput.placeholder = "%";
  addRewardInput.min = "0";
  addRewardInput.max = "100";
  const addCodeInput = document.createElement("input");
  addCodeInput.className = "add-code-input";
  addCodeInput.type = "text";
  addCodeInput.placeholder = "Kode";
  addCodeInput.maxLength = 30;
  const addCodeSubmit = document.createElement("button");
  addCodeSubmit.className = "add-code-submit";
  addCodeSubmit.type = "button";
  addCodeSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  addCodeSubmit.disabled = true;
  const addCodeCancel = document.createElement("button");
  addCodeCancel.className = "add-code-cancel";
  addCodeCancel.type = "button";
  addCodeCancel.textContent = "\u2715";
  const addCodeFormInner = document.createElement("div");
  addCodeFormInner.className = "add-code-form-inner";
  addCodeFormInner.append(addRewardInput, addCodeInput, addCodeSubmit, addCodeCancel);
  addCodeForm.append(addCodeFormInner);
  const updateSubmitState = (): void => {
    addCodeSubmit.disabled = addCodeInput.value.trim().length === 0 || addRewardInput.value.trim().length === 0;
  };
  addCodeInput.addEventListener("input", updateSubmitState);
  addRewardInput.addEventListener("input", () => {
    // Strip anything that isn't a digit or decimal separator
    addRewardInput.value = addRewardInput.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1");
    const v = Number(addRewardInput.value);
    if (addRewardInput.value !== "" && v > 100) addRewardInput.value = "100";
    updateSubmitState();
  });
  const closeAddForm = (): void => {
    addCodeForm.style.display = "none";
    addCodeInput.value = "";
    addRewardInput.value = "";
    addCodeSubmit.disabled = true;
  };
  const parseRewardNum = (r: string): number => parseFloat(r.replace(",", ".")) || 0;
  const createCodeValueGroup = (code: string): { group: HTMLSpanElement; codeSpan: HTMLSpanElement; copyBtn: HTMLSpanElement } => {
    const group = document.createElement("span");
    group.className = "code-copy-group";
    const codeSpan = document.createElement("span");
    codeSpan.className = "code-value";
    codeSpan.textContent = code;
    const copyBtn = document.createElement("span");
    copyBtn.className = "copy-code-btn";
    copyBtn.innerHTML = COPY_ICON_SVG;
    const copyTooltip = document.createElement("div");
    copyTooltip.className = "copy-code-tooltip";
    copyTooltip.textContent = `Kopier rabattkode: ${code}`;
    shadowRoot.append(copyTooltip);
    copyBtn.addEventListener("mouseenter", () => {
      const rect = copyBtn.getBoundingClientRect();
      copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
      copyTooltip.style.top = `${rect.top - 30}px`;
      copyTooltip.style.transform = "translateX(-50%)";
      shadowRoot.append(copyTooltip);
      copyTooltip.classList.add("visible");
    });
    copyBtn.addEventListener("mouseleave", () => { copyTooltip.classList.remove("visible"); });
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = CHECK_ICON_SVG;
        copyTooltip.textContent = "Kopiert!";
        copyTooltip.classList.add("visible");
        setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON_SVG;
          copyTooltip.textContent = `Kopier rabattkode: ${code}`;
          copyTooltip.classList.remove("visible");
        }, 1500);
      });
    });
    group.append(codeSpan, copyBtn);
    return { group, codeSpan, copyBtn };
  };
  const resortCodesList = (): void => {
    const rows = [...codesList.querySelectorAll<HTMLElement>(".code-item-row")];
    rows.sort((a, b) => {
      const pa = parseFloat(a.querySelector<HTMLElement>(".code-reward")?.dataset.pct ?? "0") || 0;
      const pb = parseFloat(b.querySelector<HTMLElement>(".code-reward")?.dataset.pct ?? "0") || 0;
      return pb - pa;
    });
    for (const row of rows) {
      row.classList.remove("code-item-row--best");
      codesList.append(row);
    }
    if (rows[0]) rows[0].classList.add("code-item-row--best");
    codesList.prepend(addCodeForm);
  };
  const submitCode = (): void => {
    const code = addCodeInput.value.trim().toUpperCase();
    const rawReward = addRewardInput.value.trim();
    const reward = rawReward.length > 0 ? `${rawReward} %` : "?";
    if (code.length === 0) return;
    const hasProfanity = (text: string): boolean =>
      text.toLowerCase().split(/[^a-z0-9æøå]+/).some((w) => w.length > 0 && PROFANITY_SET.has(w));
    if (hasProfanity(code) || hasProfanity(rawReward)) {
      addCodeInput.style.borderColor = "#e05555";
      setTimeout(() => { addCodeInput.style.borderColor = ""; }, 1500);
      return;
    }
    console.info(`[cashback-varsler] User submitted code for ${CURRENT_HOST}: ${code} (${reward})`);
    closeAddForm();

    void apiSubmitCode(CURRENT_HOST, code, reward).then((result) => {
      if (!result.ok) {
        row1.remove();
        let msg = "Noe gikk galt, prøv igjen.";
        if (result.duplicate === true) msg = "Koden er allerede lagt til.";
        if (result.rate_limited === true) msg = "Du har nådd grensen på 5 handlinger per dag.";
        const warn = document.createElement("div");
        warn.textContent = msg;
        warn.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
        // Insert before the first visible code row, or at top of codesList
        const firstRow = codesList.querySelector<HTMLElement>(".code-item-row");
        if (firstRow) {
          firstRow.insertAdjacentElement("beforebegin", warn);
        } else {
          codesList.append(warn);
        }
        setTimeout(() => warn.remove(), 2500);
        return;
      }
      if (result.id) {
        item.dataset.codeId = String(result.id);
        // Show delete button inside chip, left of downvote
        const deleteBtn = makeDeleteBtn(result.id, row1);
        item.insertBefore(deleteBtn, down1);
      }
    });

    // Add immediately to the list (after addCodeForm, i.e. at the top)
    const item = document.createElement("div");
    item.className = "code-item";
    item.dataset.codeId = "pending";
    const rewardEl = document.createElement("span");
    rewardEl.className = "code-reward";
    if (/%/.test(reward)) {
      rewardEl.dataset.pct = String(parseRewardNum(reward));
      rewardEl.dataset.origReward = reward;
    }
    rewardEl.textContent = reward;
    const { group: codeGroup } = createCodeValueGroup(code);
    const { upBtn: up1, downBtn: down1 } = attachVoteButtons(item);
    item.append(rewardEl, codeGroup, down1, up1);
    const row1 = document.createElement("div");
    row1.className = "code-item-row";
    row1.dataset.net = "0";
    row1.append(item);
    addCodeForm.insertAdjacentElement("afterend", row1);
    resortCodesList();
    // count no longer shown
  };
  addRewardInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddForm();
    if (e.key === "Enter") { e.preventDefault(); addCodeInput.focus(); }
  });
  addCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddForm();
    if (e.key === "Enter" && addCodeInput.value.trim().length > 0 && addRewardInput.value.trim().length > 0) submitCode();
  });
  addCodeCancel.addEventListener("click", closeAddForm);
  addCodeSubmit.addEventListener("click", submitCode);
  addCodeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    codesSection.classList.remove("collapsed");
    addCodeForm.style.display = "";
    addRewardInput.focus();
  });
  codesList.append(addCodeForm);

  const expiredSection = document.createElement("div");
  expiredSection.className = "expired-section collapsed";
  expiredSection.style.display = "none";
  const expiredToggle = document.createElement("button");
  expiredToggle.className = "expired-toggle";
  expiredToggle.type = "button";
  const expiredToggleArrow = document.createElement("span");
  expiredToggleArrow.className = "expired-toggle-arrow";
  expiredToggleArrow.textContent = "\u25BC";
  const expiredToggleText = document.createElement("span");
  expiredToggleText.textContent = "Utgåtte koder";
  expiredToggle.append(expiredToggleArrow, expiredToggleText);
  expiredToggle.addEventListener("click", () => { expiredSection.classList.toggle("collapsed"); });
  const expiredList = document.createElement("div");
  expiredList.className = "expired-list";
  expiredSection.append(expiredToggle, expiredList);

  const makeDeleteBtn = (codeId: number, row: HTMLElement): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.className = "delete-code-btn";
    btn.type = "button";
    btn.title = "Slett koden din";
    btn.innerHTML = `×`;
    btn.addEventListener("click", () => {
      void apiDeleteCode(codeId).then((ok) => {
        if (ok) {
          row.remove();
          resortCodesList();
        }
      });
    });
    return btn;
  };

  const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;

  const attachVoteButtons = (item: HTMLElement, staticCode?: { code: string; reward: string; hostname: string }, initialVote: 1 | -1 | 0 = 0): { upBtn: HTMLButtonElement; downBtn: HTMLButtonElement } => {
    let upvotes = 0;
    let downvotes = 0;
    let upvoted = initialVote === 1;
    let downvoted = initialVote === -1;
    const upBtn = document.createElement("button");
    upBtn.className = "vote-btn";
    upBtn.type = "button";
    upBtn.innerHTML = THUMBS_UP_SVG;
    const upCountEl = document.createElement("span");
    upCountEl.className = "vote-count";
    upBtn.append(upCountEl);
    const upTooltip = document.createElement("div");
    upTooltip.className = "copy-code-tooltip";
    upTooltip.textContent = "Koden fungerer!";
    shadowRoot.append(upTooltip);
    upBtn.addEventListener("mouseenter", () => {
      const rect = upBtn.getBoundingClientRect();
      upTooltip.style.left = `${rect.left + rect.width / 2}px`;
      upTooltip.style.top = `${rect.top - 30}px`;
      upTooltip.style.transform = "translateX(-50%)";
      upTooltip.classList.add("visible");
    });
    upBtn.addEventListener("mouseleave", () => { upTooltip.classList.remove("visible"); });
    const downBtn = document.createElement("button");
    downBtn.className = "vote-btn";
    downBtn.type = "button";
    downBtn.innerHTML = THUMBS_DOWN_SVG;
    const downCountEl = document.createElement("span");
    downCountEl.className = "vote-count";
    downBtn.append(downCountEl);
    const downTooltip = document.createElement("div");
    downTooltip.className = "copy-code-tooltip";
    downTooltip.textContent = "Koden er utgått";
    shadowRoot.append(downTooltip);
    downBtn.addEventListener("mouseenter", () => {
      const rect = downBtn.getBoundingClientRect();
      downTooltip.style.left = `${rect.left + rect.width / 2}px`;
      downTooltip.style.top = `${rect.top - 30}px`;
      downTooltip.style.transform = "translateX(-50%)";
      downTooltip.classList.add("visible");
    });
    downBtn.addEventListener("mouseleave", () => { downTooltip.classList.remove("visible"); });
    const syncExpired = (): void => {
      const net = upvotes - downvotes;
      upCountEl.textContent = net > 0 ? String(net) : "";
      downCountEl.textContent = net < 0 ? String(Math.abs(net)) : "";
      const container = item.closest(".code-item-row") ?? item;
      (container as HTMLElement).dataset.net = String(net);
      if (net < 0 && container.parentElement === codesList) {
        expiredList.append(container);
        item.classList.add("expired");
        expiredSection.style.display = "";
        resortCodesList();
      } else if (net >= 0 && container.parentElement === expiredList) {
        codesList.append(container);
        item.classList.remove("expired");
        if (expiredList.children.length === 0) expiredSection.style.display = "none";
        resortCodesList();
      } else {
        resortCodesList();
      }
    };
    upBtn.addEventListener("click", () => {
      userHasVoted = true;
      const codeId = Number(item.dataset.codeId);
      if (upvoted) {
        upvotes--; upvoted = false; upBtn.classList.remove("voted");
      } else {
        if (downvoted) { downvotes--; downvoted = false; downBtn.classList.remove("downvoted"); }
        upvotes++; upvoted = true; upBtn.classList.add("voted");
      }
      syncExpired();
      void apiVote(codeId, 1, staticCode).then((res) => {
        if (res !== null && "rate_limited" in res) {
          if (upvoted) { upvotes--; upvoted = false; upBtn.classList.remove("voted"); }
          else { upvotes++; upvoted = true; upBtn.classList.add("voted"); }
          syncExpired();
          showRateLimitFlash(upBtn);
        } else if (res !== null) {
          if ("registered_id" in res && res.registered_id !== undefined) item.dataset.codeId = String(res.registered_id);
          if (res.deleted) { delete item.dataset.codeId; }
          upvotes = res.upvotes; downvotes = res.downvotes;
          upvoted = !res.toggled_off && upvoted;
          if (res.toggled_off) upBtn.classList.remove("voted");
          syncExpired();
        }
      });
    });
    downBtn.addEventListener("click", () => {
      userHasVoted = true;
      const codeId = Number(item.dataset.codeId);
      if (downvoted) {
        downvotes--; downvoted = false; downBtn.classList.remove("downvoted");
      } else {
        if (upvoted) { upvotes--; upvoted = false; upBtn.classList.remove("voted"); }
        downvotes++; downvoted = true; downBtn.classList.add("downvoted");
      }
      syncExpired();
      void apiVote(codeId, -1, staticCode).then((res) => {
        if (res !== null && "rate_limited" in res) {
          if (downvoted) { downvotes--; downvoted = false; downBtn.classList.remove("downvoted"); }
          else { downvotes++; downvoted = true; downBtn.classList.add("downvoted"); }
          syncExpired();
          showRateLimitFlash(downBtn);
        } else if (res !== null) {
          if ("registered_id" in res && res.registered_id !== undefined) item.dataset.codeId = String(res.registered_id);
          if (res.deleted) { delete item.dataset.codeId; }
          upvotes = res.upvotes; downvotes = res.downvotes;
          downvoted = !res.toggled_off && downvoted;
          if (res.toggled_off) downBtn.classList.remove("downvoted");
          syncExpired();
        }
      });
    });
    return { upBtn, downBtn };
  };

  // Helper to build a row for a crawler offer
  const buildCrawlerRow = (
    codeOffer: typeof codeOffers[number],
    dbId?: number,
    initUpvotes = 0,
    initDownvotes = 0,
    initialVote: 1 | -1 | 0 = 0,
  ): HTMLDivElement => {
    const code = codeOffer.discountCode ?? "";
    const item = document.createElement("div");
    item.className = "code-item";
    if (dbId !== undefined) item.dataset.codeId = String(dbId);
    const reward = document.createElement("span");
    reward.className = "code-reward";
    const isNumericReward = /^\d[\d,.\ \-–]*\s*(?:%|kr)/i.test(codeOffer.reward.trim());
    if (/%/.test(codeOffer.reward)) {
      reward.dataset.pct = String(parseRewardNum(codeOffer.reward));
      reward.dataset.origReward = codeOffer.reward;
    }
    reward.textContent = isNumericReward ? codeOffer.reward : "?";
    const { group: codeGroup } = createCodeValueGroup(code);
    const { upBtn, downBtn } = attachVoteButtons(
      item,
      { code, reward: codeOffer.reward, hostname: CURRENT_HOST },
      initialVote,
    );
    const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
    const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
    if (upCountEl && initUpvotes > 0) upCountEl.textContent = String(initUpvotes);
    if (downCountEl && initDownvotes > 0) downCountEl.textContent = String(initDownvotes);
    if (initialVote === 1) upBtn.classList.add("voted");
    else if (initialVote === -1) downBtn.classList.add("downvoted");
    const sourceChip = createCodeSourceChip(codeOffer);
    if (sourceChip !== undefined) {
      item.append(reward, codeGroup, downBtn, upBtn, sourceChip);
    } else {
      item.append(reward, codeGroup, downBtn, upBtn);
    }
    const row = document.createElement("div");
    row.className = "code-item-row";
    row.append(item);

    // Terms tooltip for provider codes (e.g. DNB)
    if (codeOffer.terms) {
      const termsTooltip = document.createElement("div");
      termsTooltip.className = "offer-tooltip";
      setTooltipContent(termsTooltip, [codeOffer.terms]);
      shadowRoot.append(termsTooltip);
      row.addEventListener("mouseenter", () => {
        const panelEl = shadowRoot.querySelector(".panel");
        const panelRect = panelEl?.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        termsTooltip.style.left = "-9999px";
        termsTooltip.style.top = "-9999px";
        termsTooltip.classList.add("visible");
        const tooltipHeight = termsTooltip.offsetHeight;
        const rightEdge = panelRect ? panelRect.right + 6 : rowRect.right + 6;
        termsTooltip.style.left = `${rightEdge}px`;
        termsTooltip.style.top = `${rowRect.top + rowRect.height / 2 - tooltipHeight / 2}px`;
      });
      row.addEventListener("mouseleave", () => { termsTooltip.classList.remove("visible"); });
    }

    return row;
  };

  const createCodeSourceChip = (codeOffer: CashbackOffer): HTMLAnchorElement | undefined => {
    const sourceProvider = getCodeSourceProvider(codeOffer);
    if (sourceProvider === undefined) return undefined;

    const sourceUrl = codeOffer.sourceUrl || codeOffer.activationUrl;
    const chip = document.createElement("a");
    chip.className = `provider-badge provider-${sourceProvider} code-source-badge`;
    chip.href = sourceUrl;
    chip.target = "_blank";
    chip.rel = "noreferrer";
    chip.title = `Åpne ${formatProviderName(sourceProvider)}-tilbudet`;
    chip.textContent = formatProviderName(sourceProvider);
    return chip;
  };

  codesSection.append(codesToggle, codesList, expiredSection);
  const regionPricesSection = document.createElement("div");
  regionPricesSection.className = "region-prices-section";
  if (regionPrices !== undefined && regionPrices.prices.length > 0) {
    if (initialRegionPricesCollapsed) {
      regionPricesSection.classList.add("collapsed");
    }

    const displayedRegionPrices = regionPrices.prices;
    const regionPricesToggle = document.createElement("button");
    regionPricesToggle.className = "region-prices-toggle";
    regionPricesToggle.type = "button";
    const regionPricesToggleArrow = document.createElement("span");
    regionPricesToggleArrow.className = "region-prices-toggle-arrow";
    regionPricesToggleArrow.textContent = "\u25BC";
    const regionPricesToggleText = document.createElement("span");
    regionPricesToggleText.textContent = "Region ⚠";
    regionPricesToggle.append(regionPricesToggleArrow, regionPricesToggleText);
    regionPricesToggle.addEventListener("click", () => {
      const isCollapsed = regionPricesSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [REGION_PRICES_COLLAPSED_KEY]: isCollapsed });
    });
    const regionPriceCards = displayedRegionPrices.map((regionPrice) => {
      const card = buildRegionPriceCard(regionPrice, regionPrice.region === regionPrices.prices[0]?.region);
      const tooltip = document.createElement("div");
      tooltip.className = "offer-tooltip";
      setTooltipContent(tooltip, buildRegionPriceTooltipParts(regionPrice, regionPrices));
      shadowRoot.append(tooltip);
      card.addEventListener("mouseenter", () => {
        positionTooltipRightOfPanel(tooltip, card, shadowRoot);
      });
      card.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
      return card;
    });

    regionPricesSection.append(
      regionPricesToggle,
      ...regionPriceCards,
    );
  }

  const priceMatchSection = document.createElement("div");
  priceMatchSection.className = "price-match-section";
  if (priceMatches.length > 0) {
    if (initialPriceMatchCollapsed) {
      priceMatchSection.classList.add("collapsed");
    }

    const priceMatchToggle = document.createElement("button");
    priceMatchToggle.className = "price-match-toggle";
    priceMatchToggle.type = "button";
    const priceMatchToggleArrow = document.createElement("span");
    priceMatchToggleArrow.className = "price-match-toggle-arrow";
    priceMatchToggleArrow.textContent = "\u25BC";
    const priceMatchToggleText = document.createElement("span");
    priceMatchToggleText.textContent = "Prismatch";
    priceMatchToggle.append(priceMatchToggleArrow, priceMatchToggleText);
    priceMatchToggle.addEventListener("click", () => {
      const isCollapsed = priceMatchSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [PRICE_MATCH_COLLAPSED_KEY]: isCollapsed });
    });

    priceMatchSection.append(
      priceMatchToggle,
      ...priceMatches.map((priceMatch, index) => buildPriceMatchCard(priceMatch, index === 0)),
    );
  }

  body.append(header);
  if (mainOffers.length > 0) body.append(offerList);
  if (regionPrices !== undefined && regionPrices.prices.length > 0) body.append(regionPricesSection);
  if (priceMatches.length > 0) body.append(priceMatchSection);
  body.append(chipsSection);
  if (offers.length > 0) body.append(codesSection);

  let userHasVoted = false;

  // Render crawler codes immediately (sorted by reward) so list isn't empty while DB loads
  [...codeOffers]
    .sort((a, b) => parseRewardNum(b.reward) - parseRewardNum(a.reward))
    .forEach((codeOffer, i) => {
      const row = buildCrawlerRow(codeOffer);
      if (i === 0) row.classList.add("code-item-row--best");
      codesList.append(row);
    });

  let dbLoaded = false;
  const loadDbCodes = (): void => {
    if (dbLoaded) return;
    dbLoaded = true;
    // Load community-submitted codes from Supabase, then merge + sort all
    void Promise.all([fetchCodesForHost(CURRENT_HOST), fetchOwnedCodesForHost(CURRENT_HOST), fetchMyVotes(CURRENT_HOST)]).then(([dbCodes, serverOwnedIds, myVotes]) => {
    const ownedIds = new Set(serverOwnedIds);
    // Don't wipe DOM if user has already voted — avoids race condition
    if (userHasVoted) {
      // Just append any DB codes not already shown
      const shownCodes = new Set(
        [...codesList.querySelectorAll<HTMLElement>(".code-value"), ...expiredList.querySelectorAll<HTMLElement>(".code-value")]
          .map((el) => el.textContent?.toUpperCase() ?? "")
      );
      for (const dbCode of dbCodes) {
        if (shownCodes.has(dbCode.code.toUpperCase())) continue;
        const item = document.createElement("div");
        item.className = "code-item";
        item.dataset.codeId = String(dbCode.id);
        const reward = document.createElement("span");
        reward.className = "code-reward";
        if (/%/.test(dbCode.reward)) {
          reward.dataset.pct = String(parseRewardNum(dbCode.reward));
          reward.dataset.origReward = dbCode.reward;
        }
        reward.textContent = dbCode.reward;
        const { group: codeGroup } = createCodeValueGroup(dbCode.code);
        const { upBtn, downBtn } = attachVoteButtons(item);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet1 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet1 > 0 ? String(initNet1) : "";
        if (downCountEl) downCountEl.textContent = initNet1 < 0 ? String(Math.abs(initNet1)) : "";
        item.append(reward, codeGroup, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.append(item);
        if (initNet1 < 0) {
          item.classList.add("expired");
          expiredList.append(row);
          expiredSection.style.display = "";
        } else {
          codesList.append(row);
        }
      }
      return;
    }
    // Map crawler codes by normalised code string for dedup/merge
    const crawlerByCode = new Map(
      codeOffers.map((o) => [( o.discountCode ?? "").toUpperCase(), o])
    );

    // Build unified entry list
    const parseReward = (r: string): number => parseFloat(r.replace(",", ".")) || 0;
    type Entry = { net: number; reward: string; render: () => HTMLDivElement };
    const entries: Entry[] = [];

    // DB codes (user-submitted + previously voted static)
    for (const dbCode of dbCodes) {
      const net = dbCode.upvotes - dbCode.downvotes;
      const matchingCrawlerOffer = crawlerByCode.get(dbCode.code.toUpperCase());
      // Remove crawler placeholder immediately so the remaining-crawler loop doesn't duplicate it
      crawlerByCode.delete(dbCode.code.toUpperCase());

      if (matchingCrawlerOffer !== undefined) {
        const myVote = myVotes[dbCode.id] ?? 0;
        entries.push({
          net,
          reward: matchingCrawlerOffer.reward,
          render: () => buildCrawlerRow(
            matchingCrawlerOffer,
            dbCode.id,
            dbCode.upvotes,
            dbCode.downvotes,
            myVote,
          ),
        });
        continue;
      }

      entries.push({ net, reward: dbCode.reward, render: () => {
        const item = document.createElement("div");
        item.className = "code-item";
        item.dataset.codeId = String(dbCode.id);
        const reward = document.createElement("span");
        reward.className = "code-reward";
        if (/%/.test(dbCode.reward)) {
          reward.dataset.pct = String(parseRewardNum(dbCode.reward));
          reward.dataset.origReward = dbCode.reward;
        }
        reward.textContent = dbCode.reward;
        const { group: codeGroup } = createCodeValueGroup(dbCode.code);
        const myVote = myVotes[dbCode.id] ?? 0;
        const { upBtn, downBtn } = attachVoteButtons(item, undefined, myVote);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet2 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet2 > 0 ? String(initNet2) : "";
        if (downCountEl) downCountEl.textContent = initNet2 < 0 ? String(Math.abs(initNet2)) : "";
        if (myVote === 1) upBtn.classList.add("voted");
        else if (myVote === -1) downBtn.classList.add("downvoted");
        item.append(reward, codeGroup, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.dataset.net = String(dbCode.upvotes - dbCode.downvotes);
        if (ownedIds.has(dbCode.id)) {
          const deleteBtn = makeDeleteBtn(dbCode.id, row);
          item.insertBefore(deleteBtn, downBtn);
        }
        row.append(item);
        return row;
      }});
    }

    // Remaining crawler codes not in DB (net = 0)
    for (const [, codeOffer] of crawlerByCode) {
      entries.push({ net: 0, reward: codeOffer.reward, render: () => buildCrawlerRow(codeOffer) });
    }

    // Sort by numeric reward descending (% only — kr amounts are not comparable)
    const rewardPct = (r: string): number => /%/.test(r) ? (parseFloat(r.replace(",", ".")) || 0) : 0;
    entries.sort((a, b) => rewardPct(b.reward) - rewardPct(a.reward));

    // Clear placeholder crawler rows and re-render sorted
    codesList.removeChild(addCodeForm);
    codesList.innerHTML = "";
    expiredList.innerHTML = "";
    expiredSection.style.display = "none";
    codesList.append(addCodeForm);

    let totalCount = 0;
    for (const entry of entries) {
      const row = entry.render();
      const item = row.querySelector<HTMLElement>(".code-item")!;
      if (entry.net < 0) {
        item.classList.add("expired");
        expiredList.append(row);
        expiredSection.style.display = "";
      } else {
        codesList.append(row);
      }
      totalCount++;
    }

    // Mark best code green
    const firstRow = codesList.querySelector<HTMLElement>(".code-item-row");
    if (firstRow) firstRow.classList.add("code-item-row--best");

    const crawlerOnlyCount = crawlerByCode.size; // already deleted matched ones above — but we need total
    const total = dbCodes.length + crawlerByCode.size; // remaining crawler + db
    if (total > 0 || codeOffers.length > 0) {
    // count no longer shown
    }
  });
  };

  // If section is already expanded on load, fetch immediately
  if (!codesSection.classList.contains("collapsed")) {
    loadDbCodes();
  }

  const pick = SUPPORT_LINKS[Math.floor(Math.random() * SUPPORT_LINKS.length)];
  if (pick !== undefined) {
    const support = document.createElement("div");
    support.className = "support";
    const supportLink = document.createElement("a");
    supportLink.href = pick.url;
    supportLink.target = "_blank";
    supportLink.rel = "noreferrer";
    supportLink.textContent = pick.text;
    const logoLink = document.createElement("a");
    logoLink.href = "https://cashbacknorge.no";
    logoLink.target = "_blank";
    logoLink.rel = "noreferrer";
    logoLink.title = "cashbacknorge.no";
    const logoImg = document.createElement("img");
    logoImg.src = CBN_LOGO_B64;
    logoImg.className = "support-logo";
    logoImg.alt = "CBN";
    logoLink.append(logoImg);
    if (pick.affiliate) support.prepend(makeAdChip());
    else supportLink.style.cssText = "flex:1;text-align:center;";
    support.append(supportLink, logoLink);
    const disclosure = document.createElement("p");
    disclosure.textContent = "Ad er affiliatelenker. ♥ støtter utvikleren direkte.";
    disclosure.style.cssText = "color:#b0bec5;font-size:10px;margin:0;padding:2px 14px 6px;";
    panel.append(topLine, body, support, disclosure);
  } else {
    panel.append(topLine, body);
  }
  notice.append(sideTab, panel);
  // Force reflow after expand transition to fix Safari whitespace bug
  panel.addEventListener("transitionend", (e) => {
    if (e.propertyName === "width" && !notice.classList.contains("collapsed")) {
      void panel.offsetHeight; // trigger reflow
    }
  });
  // Apply initial collapsed state before inserting into DOM (no transition flash)
  if (initialCollapsed) {
    notice.classList.add("collapsed", "no-transition");
    sideTabArrow.textContent = "\u203A";
    sideTab.setAttribute("aria-label", "Expand cashback offers");
  }
  shadowRoot.append(style, notice);
  const mountTarget = document.body ?? document.documentElement;
  mountTarget.append(host);
  void detectConflicts(shadowRoot, title);
  attachPriceMatchTooltips(shadowRoot, priceMatches);
  // Attach tooltips to shadow root (outside panel) so they escape overflow:hidden
  const wrappers = shadowRoot.querySelectorAll(".offer-link-wrapper");
  for (let idx = 0; idx < mainOffers.length; idx++) {
    const currentOffer = mainOffers[idx];
    if (currentOffer === undefined) continue;
    const compact = formatCompactRewardLabel(currentOffer);
    const fullReward = formatRewardLabel(currentOffer.reward, currentOffer.provider);
    const showRewardInTooltip = compact !== undefined && fullReward !== compact;
    const isCardOnlyOffer = CARD_ONLY_PROVIDERS.has(currentOffer.provider);
    const isAppOnlyOffer = APP_ONLY_PROVIDERS.has(currentOffer.provider);
    const hasTerms = currentOffer.terms.trim().length > 0;
    if (currentOffer.provider !== "cbn" && !showRewardInTooltip && !hasTerms && !isCardOnlyOffer && !isAppOnlyOffer) continue;
    const wrapper = wrappers[idx];
    if (wrapper === undefined) continue;
    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    const tooltipParts: string[] = [];
    if (currentOffer.terms) tooltipParts.push(currentOffer.terms);
    if (isCardOnlyOffer) tooltipParts.push("⚠ Betales med kort – kan ikke kombineres med ekstra cashback fra andre kort");
    if (isAppOnlyOffer) tooltipParts.push("Krever " + formatProviderName(currentOffer.provider) + "-appen for å aktivere cashback");
    setTooltipContent(tooltip, tooltipParts);
    shadowRoot.append(tooltip);
    tooltipElements.push({ element: tooltip, offer: currentOffer });
    wrapper.addEventListener("mouseenter", () => {
      const panelEl = shadowRoot.querySelector(".panel");
      const panelRect = panelEl?.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      // Show off-screen to measure, then position to right of panel
      tooltip.style.left = "-9999px";
      tooltip.style.top = "-9999px";
      tooltip.classList.add("visible");
      const tooltipHeight = tooltip.offsetHeight;
      const tooltipWidth = tooltip.offsetWidth;
      const rightEdge = panelRect ? panelRect.right + 6 : wrapperRect.right + 6;
      const preferredLeft = rightEdge;
      const fallbackLeft = wrapperRect.left + wrapperRect.width / 2 - tooltipWidth / 2;
      const left = preferredLeft + tooltipWidth > window.innerWidth - 8
        ? Math.max(8, Math.min(fallbackLeft, window.innerWidth - tooltipWidth - 8))
        : preferredLeft;
      const top = Math.max(
        8,
        Math.min(wrapperRect.top + wrapperRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8),
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    wrapper.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }
  // Re-enable transitions after layout settles (double rAF ensures reflow is done)
  if (initialCollapsed) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      notice.classList.remove("no-transition");
    }));
  }

  // Swipe-left on panel to collapse
  let panelSwipeStartX = 0;
  let panelSwipeStartY = 0;
  panel.addEventListener("touchstart", (e) => {
    panelSwipeStartX = e.touches[0]?.clientX ?? 0;
    panelSwipeStartY = e.touches[0]?.clientY ?? 0;
  }, { passive: true });
  panel.addEventListener("touchend", (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - panelSwipeStartX;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - panelSwipeStartY;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setCollapsed(notice, sideTab, sideTabArrow, true);
    }
  }, { passive: true });
}
function clearNotice(): void {
  document.getElementById(HOST_ID)?.remove();
}

function attachPriceMatchTooltips(shadowRoot: ShadowRoot, priceMatches: PriceMatchOffer[]): void {
  if (priceMatches.length === 0) return;

  const cards = shadowRoot.querySelectorAll<HTMLElement>(".price-match-card");
  for (let index = 0; index < priceMatches.length; index++) {
    const card = cards[index];
    const priceMatch = priceMatches[index];
    if (card === undefined || priceMatch === undefined) continue;

    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    setTooltipContent(tooltip, [buildPriceMatchTooltip(priceMatch)]);
    shadowRoot.append(tooltip);

    let hideTimer: number | undefined;
    const clearHideTimer = () => {
      if (hideTimer === undefined) return;
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    };
    const showTooltip = () => {
      clearHideTimer();
      positionTooltipRightOfPanel(tooltip, card, shadowRoot);
    };
    const scheduleHideTooltip = () => {
      clearHideTimer();
      hideTimer = window.setTimeout(() => {
        if (!card.matches(":hover") && !tooltip.matches(":hover")) {
          tooltip.classList.remove("visible");
        }
      }, 120);
    };

    card.addEventListener("mouseenter", showTooltip);
    card.addEventListener("mouseleave", scheduleHideTooltip);
    tooltip.addEventListener("mouseenter", showTooltip);
    tooltip.addEventListener("mouseleave", scheduleHideTooltip);
  }
}

function setTooltipContent(tooltip: HTMLElement, parts: string[]): void {
  const sections = parts
    .flatMap((part) => part.split(/\n{2,}/))
    .map(createTooltipSection)
    .filter((section): section is HTMLDivElement => section !== undefined);
  tooltip.replaceChildren(...sections);
}

function createTooltipSection(part: string): HTMLDivElement | undefined {
  const lines = part
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return undefined;

  const section = document.createElement("div");
  section.className = "offer-tooltip-section";

  if (lines.length === 1) {
    const isRateLine = /^\d[\d.,]* (%|kr)/.test(lines[0] ?? "");
    if (isRateLine) {
      const list = document.createElement("ul");
      list.className = "offer-tooltip-list";
      const item = document.createElement("li");
      item.textContent = lines[0] ?? "";
      list.append(item);
      section.append(list);
    } else {
      const text = document.createElement("span");
      text.className = "offer-tooltip-text";
      text.textContent = lines[0] ?? "";
      section.append(text);
    }
    return section;
  }

  const firstLine = lines[0] ?? "";
  const hasExplicitList = lines.slice(1).some((line) => /^[-•]\s+/.test(line));
  const listLines = /^(medlemsfordel|medlemstilbud)$/i.test(firstLine) || / tilbud$/i.test(firstLine) || hasExplicitList ? lines.slice(1) : lines;

  if (listLines.length !== lines.length) {
    const title = document.createElement("span");
    title.className = "offer-tooltip-title";
    title.textContent = firstLine;
    section.append(title);
  }

  const list = document.createElement("ul");
  list.className = "offer-tooltip-list";
  for (const line of listLines) {
    const item = document.createElement("li");
    item.textContent = line.replace(/^-\s+/, "");
    list.append(item);
  }
  section.append(list);
  return section;
}

function applyHostOverlayStyle(host: HTMLElement): void {
  host.style.setProperty("background", "transparent", "important");
  host.style.setProperty("border", "0", "important");
  host.style.setProperty("bottom", "16px", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("height", "0", "important");
  host.style.setProperty("inset", "auto auto 16px 0", "important");
  host.style.setProperty("left", "0", "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("overflow", "visible", "important");
  host.style.setProperty("padding", "0", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("width", "0", "important");
  host.style.setProperty("z-index", "2147483647", "important");
}
function createSiteIcon(): HTMLImageElement {
  const siteIcon = document.createElement("img");
  siteIcon.className = "site-icon";
  siteIcon.alt = "";
  siteIcon.src = findSiteIconUrl();
  siteIcon.addEventListener("error", () => {
    siteIcon.style.visibility = "hidden";
  });
  return siteIcon;
}
function setCollapsed(
  notice: HTMLElement,
  sideTab: HTMLButtonElement,
  sideTabArrow: HTMLElement,
  collapsed: boolean,
): void {
  notice.classList.toggle("collapsed", collapsed);
  sideTabArrow.textContent = collapsed ? "\u203A" : "\u2039"; // › or ‹
  sideTab.setAttribute(
    "aria-label",
    collapsed ? "Expand cashback offers" : "Collapse cashback offers",
  );
  chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: collapsed });
  if (!collapsed) {
    resetExpandedPanelLayout(notice);
  }
}

function resetExpandedPanelLayout(notice: HTMLElement): void {
  const panel = notice.querySelector<HTMLElement>(".panel");
  if (panel === null) return;
  requestAnimationFrame(() => {
    panel.style.height = "auto";
    panel.style.minHeight = "0";
    void panel.offsetHeight;
  });
}

function isCashbackFoundMessage(value: unknown): value is CashbackFoundMessage {
  return (
    isRecord(value) &&
    value.type === "cashback-found" &&
    Array.isArray(value.offers) &&
    value.offers.every(isCashbackOffer)
  );
}
function isCashbackNoneMessage(value: unknown): value is CashbackNoneMessage {
  return isRecord(value) && value.type === "cashback-none";
}
function isOffersForUrlResponse(value: unknown): value is OffersForUrlResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return Array.isArray(value.offers) && value.offers.every(isCashbackOffer);
  }
  return typeof value.reason === "string";
}
function isPriceMatchForProductResponse(value: unknown): value is PriceMatchForProductResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return (
      (value.offer === undefined || isPriceMatchOffer(value.offer)) &&
      (value.offers === undefined || (Array.isArray(value.offers) && value.offers.every(isPriceMatchOffer)))
    );
  }
  return typeof value.reason === "string";
}
function isPlayStationRegionPricesResponse(value: unknown): value is PlayStationRegionPricesResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return value.result === undefined || isPlayStationRegionPriceResult(value.result);
  }
  return typeof value.reason === "string";
}
function isPlayStationRegionPriceResult(value: unknown): value is PlayStationRegionPriceResult {
  return (
    isRecord(value) &&
    typeof value.productId === "string" &&
    typeof value.fetchedAt === "string" &&
    (value.productName === undefined || typeof value.productName === "string") &&
    (value.ratesUpdatedAt === undefined || typeof value.ratesUpdatedAt === "string") &&
    (value.sourceProvider === undefined || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") &&
    (value.sourceName === undefined || typeof value.sourceName === "string") &&
    (value.sourceDetail === undefined || typeof value.sourceDetail === "string") &&
    (value.planName === undefined || typeof value.planName === "string") &&
    (value.availablePlanNames === undefined || (Array.isArray(value.availablePlanNames) && value.availablePlanNames.every((entry) => typeof entry === "string"))) &&
    Array.isArray(value.prices) &&
    value.prices.every(isPlayStationRegionPrice)
  );
}
function isPlayStationRegionPrice(value: unknown): value is PlayStationRegionPrice {
  return (
    isRecord(value) &&
    typeof value.region === "string" &&
    typeof value.countryName === "string" &&
    typeof value.flag === "string" &&
    typeof value.locale === "string" &&
    typeof value.currency === "string" &&
    typeof value.price === "number" &&
    typeof value.formattedPrice === "string" &&
    typeof value.nokAmount === "number" &&
    typeof value.formattedNok === "string" &&
    typeof value.productUrl === "string" &&
    (value.priceHistoryUrl === undefined || typeof value.priceHistoryUrl === "string") &&
    (value.sourceProvider === undefined || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") &&
    (value.sourceName === undefined || typeof value.sourceName === "string") &&
    (value.sourceDetail === undefined || typeof value.sourceDetail === "string") &&
    (value.planName === undefined || typeof value.planName === "string") &&
    (value.planAlternatives === undefined || (Array.isArray(value.planAlternatives) && value.planAlternatives.every(isRegionPricePlanAlternative)))
  );
}
function isRegionPricePlanAlternative(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.planName === "string" &&
    (value.formattedPrice === undefined || typeof value.formattedPrice === "string") &&
    (value.formattedNok === undefined || typeof value.formattedNok === "string") &&
    (value.unavailableReason === undefined || typeof value.unavailableReason === "string")
  );
}
function isPriceMatchOffer(value: unknown): value is PriceMatchOffer {
  return (
    isRecord(value) &&
    (value.source === undefined || value.source === "prisjakt" || value.source === "godpris" || value.source === "klarna" || value.source === "prisradar" || value.source === "isthereanydeal" || value.source === "ggdeals" || value.source === "allkeyshop" || value.source === "taxfree" || value.source === "vinmonopolet" || value.source === "sesum" || value.source === "enhver" || value.source === "kassal" || value.source === "finnreise" || value.source === "panflights" || value.source === "momondo" || value.source === "skyscanner" || value.source === "travellink" || value.source === "tripcom") &&
    (value.sourceName === undefined || typeof value.sourceName === "string") &&
    (value.details === undefined || typeof value.details === "string") &&
    (value.matchedCurrentMerchant === undefined || typeof value.matchedCurrentMerchant === "boolean") &&
    (value.matchedExactProduct === undefined || typeof value.matchedExactProduct === "boolean") &&
    typeof value.shopName === "string" &&
    typeof value.price === "string" &&
    typeof value.amount === "number" &&
    (value.sortAmount === undefined || typeof value.sortAmount === "number") &&
    typeof value.currency === "string" &&
    typeof value.productName === "string" &&
    typeof value.productUrl === "string" &&
    (value.offerUrl === undefined || typeof value.offerUrl === "string") &&
    (value.alternatives === undefined || (Array.isArray(value.alternatives) && value.alternatives.every(isPriceMatchAlternative)))
  );
}
function isPriceMatchAlternative(value: unknown): value is PriceMatchAlternative {
  return (
    isRecord(value) &&
    typeof value.shopName === "string" &&
    typeof value.price === "string" &&
    typeof value.amount === "number" &&
    (value.sortAmount === undefined || typeof value.sortAmount === "number") &&
    typeof value.currency === "string" &&
    (value.platform === undefined || typeof value.platform === "string") &&
    (value.shippingPrice === undefined || typeof value.shippingPrice === "string") &&
    (value.totalPrice === undefined || typeof value.totalPrice === "string")
  );
}
function isCashbackIndex(value: unknown): value is CashbackIndex {
  if (
    !isRecord(value) ||
    typeof value.version !== "number" ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.offers) ||
    !isRecord(value.domainIndex)
  ) {
    return false;
  }
  return (
    value.offers.every(isCashbackOffer) &&
    Object.values(value.domainIndex).every((offers) => {
      return Array.isArray(offers) && offers.every(isCashbackOffer);
    })
  );
}
function isCashbackOffer(value: unknown): value is CashbackOffer {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.merchantName === "string" &&
    Array.isArray(value.domains) &&
    value.domains.every(isString) &&
    typeof value.reward === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.activationUrl === "string" &&
    typeof value.terms === "string" &&
    (value.discountCode === undefined || typeof value.discountCode === "string") &&
    typeof value.updatedAt === "string"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function findOffersForHostname(
  cashbackIndex: CashbackIndex,
  hostname: string,
): CashbackOffer[] {
  const normalizedHostname = normalizeHostname(hostname);
  const canonical = DOMAIN_ALIASES[normalizedHostname] ?? normalizedHostname;
  // Also check parent domain when on a CC subdomain: visiting no.jbl.com should find jbl.com
  const ccParentDomains = CC_SUBDOMAINS.flatMap((cc) =>
    normalizedHostname.startsWith(`${cc}.`) ? [normalizedHostname.slice(cc.length + 1)] : []
  );
  const lookupDomains = [
    normalizedHostname,
    ...(canonical !== normalizedHostname ? [canonical] : []),
    ...getAlternateTldDomains(normalizedHostname),
    ...CC_SUBDOMAINS.map((cc) => `${cc}.${normalizedHostname}`),
    ...ccParentDomains,
  ];
  const indexMatches = lookupDomains.flatMap((domain) => {
    return cashbackIndex.domainIndex[domain] ?? [];
  });
  // Only use suffix/child matches if there are no exact matches for the current hostname.
  // This prevents e.g. apple.com offers on music.apple.com (suffixMatches)
  // and music.apple.com offers on apple.com (childDomainMatches).
  const hasExactMatches = (cashbackIndex.domainIndex[normalizedHostname] ?? []).length > 0;
  const suffixMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return (
        normalizedDomain !== normalizedHostname &&
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      );
    });
  });
  const childDomainMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return lookupDomains.some((lookupDomain) => {
        return (
          normalizedDomain !== lookupDomain &&
          normalizedDomain.endsWith(`.${lookupDomain}`)
        );
      });
    });
  });
  return sortOffersByReward(
    uniqueOffers([...indexMatches, ...suffixMatches, ...childDomainMatches]),
  );
}
function normalizeHostname(hostname: string): string {
  const lowerCaseHostname = hostname.trim().toLowerCase();
  const withoutTrailingDot = lowerCaseHostname.endsWith(".")
    ? lowerCaseHostname.slice(0, -1)
    : lowerCaseHostname;
  return withoutTrailingDot.startsWith("www.")
    ? withoutTrailingDot.slice(4)
    : withoutTrailingDot;
}
function normalizeDomainInput(input: string): string {
  const trimmedInput = input.trim();
  const urlLikeInput = trimmedInput.includes("://")
    ? trimmedInput
    : `https://${trimmedInput}`;
  const parsedUrl = parseUrl(urlLikeInput);
  if (parsedUrl !== undefined) {
    return normalizeHostname(parsedUrl.hostname);
  }
  const firstSlashIndex = trimmedInput.indexOf("/");
  const hostPart =
    firstSlashIndex === -1 ? trimmedInput : trimmedInput.slice(0, firstSlashIndex);
  return normalizeHostname(hostPart);
}
const DOMAIN_ALIASES: Record<string, string> = {
  "jbl.com": "no.jbl.com",
};
const COMMON_TLDS = [".com", ".no", ".se", ".dk", ".fi", ".eu"];
const CC_SUBDOMAINS = ["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"];
function getAlternateTldDomains(domain: string): string[] {
  const parts = domain.split(".");
  if (parts.length !== 2) return [];
  const tld = `.${parts[1]}`;
  if (!COMMON_TLDS.includes(tld)) return [];
  const baseName = parts[0];
  return COMMON_TLDS
    .filter((commonTld) => commonTld !== tld)
    .map((commonTld) => `${baseName}${commonTld}`);
}
function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}
function uniqueOffers(offers: CashbackOffer[]): CashbackOffer[] {
  const byKey = new Map<string, CashbackOffer>();
  for (const offer of offers) {
    const codeSuffix = offer.discountCode !== undefined ? `:${offer.discountCode}` : "";
    const key = `${offer.provider}:${offer.merchantName.toLowerCase()}${codeSuffix}`;
    const existing = byKey.get(key);
    const newVal = parseRewardValue(offer.reward);
    const existingVal = existing !== undefined ? parseRewardValue(existing.reward) : null;
    const isRange = offer.reward.includes("-");
    const isBetterReward = existingVal === null ||
      rewardKindRank(newVal.kind) > rewardKindRank(existingVal.kind) ||
      (newVal.kind === existingVal.kind && newVal.amount > existingVal.amount);
    if (existing === undefined || isBetterReward || (newVal.amount === existingVal!.amount && isRange && !existing.reward.includes("-"))) {
      byKey.set(key, offer);
    }
  }
  return [...byKey.values()];
}
function sortOffersByReward(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
    const firstIsSupport = firstOffer.provider === "cbn";
    const secondIsSupport = secondOffer.provider === "cbn";

    if (firstIsSupport !== secondIsSupport) {
      return firstIsSupport ? 1 : -1;
    }

    const firstReward = parseRewardValue(firstOffer.reward);
    const secondReward = parseRewardValue(secondOffer.reward);
    const rewardKindSort =
      rewardKindRank(secondReward.kind) - rewardKindRank(firstReward.kind);
    if (rewardKindSort !== 0) return rewardKindSort;
    const rewardAmountSort = secondReward.amount - firstReward.amount;
    if (rewardAmountSort !== 0) return rewardAmountSort;
    const merchantSort = firstOffer.merchantName.localeCompare(secondOffer.merchantName);
    if (merchantSort !== 0) return merchantSort;
    return firstOffer.provider.localeCompare(secondOffer.provider);
  });
}
type RewardValue = {
  kind: "percentage" | "fixed" | "unit" | "points" | "unknown";
  amount: number;
};
function parseRewardValue(reward: string): RewardValue {
  const rangeMatch = reward.match(/\d+(?:[,.]\d+)?\s*-\s*(\d+(?:[,.]\d+)?)\s*%/);
  const percentageMatch = rangeMatch
    ? [null, rangeMatch[1]]
    : reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
  if (percentageMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber(percentageMatch[1] ?? "0"),
    };
  }
  const pointsRateMatch = reward.match(/(\d[\d\s]*)\s*poeng\s+per\s+100\s*kr/i);
  if (pointsRateMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber((pointsRateMatch[1] ?? "0").replace(/\s/g, "")) / EB_PER_TRUMF_KR,
    };
  }
  const unitMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr\s*\//i);
  if (unitMatch !== null) {
    return {
      kind: "unit",
      amount: parseLocalizedNumber(unitMatch[1] ?? "0"),
    };
  }
  const krRangeMatch = reward.match(/\d[\d\s]*(?:[,.]\d+)?\s*-\s*(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
  if (krRangeMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((krRangeMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  const fixedMatch = reward.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
  if (fixedMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((fixedMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  const pointsMatch = reward.match(/(\d[\d\s]*)\s*poeng/i);
  if (pointsMatch !== null) {
    return {
      kind: "points",
      amount: parseLocalizedNumber((pointsMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  return {
    kind: "unknown",
    amount: 0,
  };
}
function parseLocalizedNumber(value: string): number {
  const parsedValue = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
function rewardKindRank(kind: RewardValue["kind"]): number {
  if (kind === "percentage") return 4;
  if (kind === "fixed") return 3;
  if (kind === "unit") return 2;
  if (kind === "points") return 1;
  return 0;
}
function buildPriceMatchCard(priceMatch: PriceMatchOffer, isBest = false): HTMLAnchorElement {
  const priceMatchCard = document.createElement("a");
  priceMatchCard.className = "price-match-card";
  if (isBest) priceMatchCard.classList.add("price-match-card--best");
  priceMatchCard.href = priceMatch.productUrl;
  priceMatchCard.target = "_blank";
  priceMatchCard.rel = "noreferrer";

  const priceMatchTitle = document.createElement("span");
  priceMatchTitle.className = "price-match-title";
  const priceMatchProduct = document.createElement("span");
  priceMatchProduct.className = "price-match-product";
  priceMatchProduct.textContent = priceMatch.productName;
  const priceMatchShop = document.createElement("span");
  priceMatchShop.className = "price-match-shop";
  priceMatchShop.textContent = priceMatch.shopName;
  priceMatchTitle.append(priceMatchProduct, priceMatchShop);

  const priceMatchPrice = document.createElement("span");
  priceMatchPrice.className = "price-match-price";
  priceMatchPrice.textContent = priceMatch.price;

  const priceMatchBadge = document.createElement("span");
  priceMatchBadge.className = `provider-badge provider-${getPriceMatchProviderClass(priceMatch)}`;
  priceMatchBadge.textContent = getPriceMatchSourceName(priceMatch);
  priceMatchCard.append(priceMatchTitle, priceMatchPrice, priceMatchBadge);
  return priceMatchCard;
}
function buildRegionPriceCard(regionPrice: PlayStationRegionPrice, isBest = false): HTMLDivElement {
  const regionPriceCard = document.createElement("div");
  regionPriceCard.className = "region-price-card";
  if (isBest) regionPriceCard.classList.add("region-price-card--best");

  const regionPriceMain = document.createElement("a");
  regionPriceMain.className = "region-price-main";
  regionPriceMain.href = regionPrice.productUrl;
  regionPriceMain.target = "_blank";
  regionPriceMain.rel = "noreferrer";
  if (regionPrice.sourceProvider !== "appstoreprice") {
    regionPriceMain.title = `Åpne ${regionPrice.countryName} i PlayStation Store`;
  }

  const regionPriceTitle = document.createElement("span");
  regionPriceTitle.className = "region-price-title";
  const regionPriceCountry = document.createElement("span");
  regionPriceCountry.className = "region-price-country";
  regionPriceCountry.textContent = `${regionPrice.flag} ${regionPrice.countryName}`;
  const regionPriceNative = document.createElement("span");
  regionPriceNative.className = "region-price-native";
  regionPriceNative.textContent = regionPrice.formattedPrice;
  regionPriceTitle.append(regionPriceCountry, regionPriceNative);

  const regionPriceNok = document.createElement("span");
  regionPriceNok.className = "region-price-nok";
  regionPriceNok.textContent = regionPrice.formattedNok;

  regionPriceMain.append(regionPriceTitle, regionPriceNok);
  regionPriceCard.append(regionPriceMain);

  const secondaryLinks = getRegionPriceSecondaryLinks(regionPrice);
  if (secondaryLinks.length > 0) {
    regionPriceCard.classList.add("region-price-card-with-action");
    const regionPriceActions = document.createElement("span");
    regionPriceActions.className = "region-price-actions";
    for (const secondaryLink of secondaryLinks) {
      const regionPriceAction = document.createElement("a");
      regionPriceAction.className = `provider-badge provider-${secondaryLink.provider} region-price-action`;
      regionPriceAction.href = secondaryLink.url;
      regionPriceAction.target = "_blank";
      regionPriceAction.rel = "noreferrer";
      if (secondaryLink.title !== undefined) {
        regionPriceAction.title = secondaryLink.title;
      }
      regionPriceAction.textContent = secondaryLink.label;
      regionPriceActions.append(regionPriceAction);
    }
    regionPriceCard.append(regionPriceActions);
  }
  return regionPriceCard;
}
type RegionPriceSecondaryLink = {
  label: string;
  provider: "gcdeals" | "ggdeals" | "psprices" | "appstoreprice";
  title?: string;
  url: string;
};
function getRegionPriceSecondaryLinks(
  regionPrice: PlayStationRegionPrice,
): RegionPriceSecondaryLink[] {
  if (regionPrice.sourceProvider === "appstoreprice") {
    return [{
      label: regionPrice.sourceName ?? "AppStorePrice",
      provider: "appstoreprice",
      url: regionPrice.productUrl,
    }];
  }

  if (regionPrice.region === "NO") {
    if (regionPrice.priceHistoryUrl === undefined) return [];
    return [{
      label: "psprices",
      provider: "psprices",
      title: "Åpne norsk prishistorikk hos PSPrices",
      url: regionPrice.priceHistoryUrl,
    }];
  }
  return [
    {
      label: "GC Deals",
      provider: "gcdeals",
      title: `Finn PSN-gavekort for ${regionPrice.countryName} hos GC Deals`,
      url: PSN_GC_DEALS_GIFT_CARD_REGION_URLS[regionPrice.region] ?? PSN_GC_DEALS_GIFT_CARD_URL,
    },
    {
      label: "GG Deals",
      provider: "ggdeals",
      title: `Finn PSN-gavekort for ${regionPrice.countryName} hos GG Deals`,
      url: PSN_GG_DEALS_GIFT_CARD_REGION_URLS[regionPrice.region] ?? PSN_GG_DEALS_GIFT_CARD_URL,
    },
  ];
}
function buildRegionPriceTooltipParts(
  regionPrice: PlayStationRegionPrice,
  regionPrices: PlayStationRegionPriceResult,
): string[] {
  if (regionPrice.sourceProvider === "appstoreprice") {
    return buildAppStorePriceRegionPriceTooltipParts(regionPrice, regionPrices);
  }

  return [buildRegionPricesTooltip(regionPrices)];
}
function buildAppStorePriceRegionPriceTooltipParts(
  regionPrice: PlayStationRegionPrice,
  regionPrices: PlayStationRegionPriceResult,
): string[] {
  const sourceName = regionPrice.sourceName ?? regionPrices.sourceName ?? "AppStorePrice";
  const planName = regionPrice.planName ?? regionPrices.planName ?? "valgt plan";
  const planAlternatives = regionPrice.planAlternatives?.slice(0, 10) ?? [];
  const planLines = planAlternatives.length > 0
    ? planAlternatives.map((alternative) => `- ${formatRegionPricePlanAlternative(alternative, regionPrice.countryName)}`)
    : [`- ${planName}: ${regionPrice.formattedNok} (${regionPrice.formattedPrice})`];
  const rateLine = regionPrices.ratesUpdatedAt !== undefined ? `FX: ${regionPrices.ratesUpdatedAt}` : "FX: live NOK conversion";

  return [
    `${regionPrice.flag} ${regionPrice.countryName}: ${planName} = ${regionPrice.formattedNok} (${regionPrice.formattedPrice})`,
    [
      `App Store-planer i ${regionPrice.countryName}`,
      ...planLines,
    ].join("\n"),
    [
      `Kilde: ${sourceName}`,
      "App Store/IAP-priser kan avvike fra direkte web-checkout hos tjenesten.",
      "Regionbytte krever vanligvis Apple ID, gavekort eller betalingsmetode i samme region.",
      rateLine,
    ].join("\n"),
  ];
}
function formatRegionPricePlanAlternative(
  alternative: NonNullable<PlayStationRegionPrice["planAlternatives"]>[number],
  countryName: string,
): string {
  if (alternative.formattedPrice !== undefined && alternative.formattedNok !== undefined) {
    return `${alternative.planName}: ${alternative.formattedNok} (${alternative.formattedPrice})`;
  }

  return `${alternative.planName}: ${alternative.unavailableReason ?? `Ikke funnet for ${countryName}`}`;
}
function buildRegionPricesTooltip(regionPrices: PlayStationRegionPriceResult): string {
  const rateLine = regionPrices.ratesUpdatedAt !== undefined ? `FX: ${regionPrices.ratesUpdatedAt}` : "FX: live NOK conversion";
  if (regionPrices.sourceProvider === "appstoreprice") {
    const planName = regionPrices.planName ?? regionPrices.productName ?? "abonnement";
    const sourceName = regionPrices.sourceName ?? "AppStorePrice";
    const availablePlanNames = regionPrices.availablePlanNames?.slice(0, 10) ?? [];
    return [
      `Viser: ${planName}.`,
      `Kilde: App Store/IAP-regionpriser fra ${sourceName}.`,
      ...(availablePlanNames.length > 1 ? [`Planer funnet: ${availablePlanNames.join(", ")}.`] : []),
      "Hold over en landrad for priser på flere planer i samme region.",
      "Kan avvike fra direkte web-checkout hos tjenesten.",
      "Regionbytte krever vanligvis Apple ID, gavekort eller betalingsmetode i samme region.",
      "Alle tilgjengelige regioner vises i listen, sortert billigst først.",
      "Regionraden og chipen åpner AppStorePrice-siden.",
      rateLine,
    ].join("\n");
  }

  return [
    "Utenlandske priser krever PSN-konto i samme region og betaling med PSN-gavekort.",
    "Typisk flyt: legg regionkontoen til på PS5-en, kjøp og last ned spillet der, spill fra norsk konto etterpå.",
    "Alle tilgjengelige regioner vises i listen, sortert billigst først.",
    "Regionraden åpner spillet i regional PlayStation Store.",
    "GC Deals- og GG Deals-chipene åpner PSN-gavekort i valgt region.",
    rateLine,
  ].join("\n");
}
function getPriceMatchProviderClass(priceMatch: PriceMatchOffer): string {
  if (priceMatch.source === "godpris") return "godpris";
  if (priceMatch.source === "klarna") return "klarna";
  if (priceMatch.source === "prisradar") return "prisradar";
  if (priceMatch.source === "sesum") return "sesum";
  if (priceMatch.source === "enhver") return "enhver";
  if (priceMatch.source === "kassal") return "kassal";
  if (priceMatch.source === "finnreise") return "finnreise";
  if (priceMatch.source === "panflights") return "panflights";
  if (priceMatch.source === "momondo") return "momondo";
  if (priceMatch.source === "skyscanner") return "skyscanner";
  if (priceMatch.source === "travellink") return "travellink";
  if (priceMatch.source === "tripcom") return "tripcom";
  if (priceMatch.source === "isthereanydeal") return "isthereanydeal";
  if (priceMatch.source === "ggdeals") return "ggdeals";
  if (priceMatch.source === "allkeyshop") return "allkeyshop";
  if (priceMatch.source === "taxfree") return "taxfree";
  if (priceMatch.source === "vinmonopolet") return "vinmonopolet";
  return "prisjakt";
}
function getPriceMatchSourceName(priceMatch: PriceMatchOffer): string {
  if (priceMatch.sourceName !== undefined) return priceMatch.sourceName;
  if (priceMatch.source === "godpris") return "Godpris";
  if (priceMatch.source === "klarna") return "Klarna";
  if (priceMatch.source === "prisradar") return "Prisradar";
  if (priceMatch.source === "sesum") return "SeSum";
  if (priceMatch.source === "enhver") return "enhver";
  if (priceMatch.source === "kassal") return "Kassalapp";
  if (priceMatch.source === "finnreise") return "FINN";
  if (priceMatch.source === "panflights") return "PanFlights";
  if (priceMatch.source === "momondo") return "momondo";
  if (priceMatch.source === "skyscanner") return "Skyscanner";
  if (priceMatch.source === "travellink") return "Travellink";
  if (priceMatch.source === "tripcom") return "Trip.com";
  if (priceMatch.source === "isthereanydeal") return "IsThereAnyDeal";
  if (priceMatch.source === "ggdeals") return "GG Deals";
  if (priceMatch.source === "allkeyshop") return "ALLKEYSHOP";
  if (priceMatch.source === "taxfree") return "Tax Free";
  if (priceMatch.source === "vinmonopolet") return "Vinmonopolet";
  return "Prisjakt";
}
function buildPriceMatchTooltip(priceMatch: PriceMatchOffer): string {
  if (isFlightSearchPriceMatch(priceMatch)) {
    const alternatives = priceMatch.alternatives ?? [];
    const details = priceMatch.details ?? priceMatch.shopName;
    const hasLivePriceList = alternatives.length > 0 &&
      (priceMatch.sortAmount ?? priceMatch.amount) < FLIGHT_STATIC_PRICE_SORT_AMOUNT;

    if (hasLivePriceList) {
      const isCalendarPrice = (priceMatch.source === "skyscanner" && priceMatch.shopName === "Skyscanner kalender") ||
        (priceMatch.source === "tripcom" && priceMatch.shopName === "Trip.com kalender");
      return [
        `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
        [
          priceMatch.shopName,
          details !== priceMatch.shopName ? details : undefined,
          `${isCalendarPrice ? "Kalenderpris" : "Beste treff"}: ${priceMatch.price}`,
          isCalendarPrice
            ? `${getPriceMatchSourceName(priceMatch)} gir kalenderpris for eksakt dato; åpne søket for faktisk treffliste.`
            : "Dato og flyplasser er filtrert til samme søk.",
        ].filter((line): line is string => line !== undefined).join("\n"),
        [
          isCalendarPrice ? "Prisgrunnlag" : "Treffliste",
          ...alternatives.map(formatPriceMatchTooltipOffer),
        ].join("\n"),
        "Bagasje, fareklasse og valgt avgang må sjekkes hos kilden.",
      ].join("\n\n");
    }

    return [
      `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
      details,
      "Åpner prissøk med samme flyplasser, datoer og antall voksne.",
      "Bagasje, fareklasse og valgt avgang må sjekkes hos kilden.",
    ].join("\n");
  }

  const alternatives = priceMatch.alternatives?.length
    ? priceMatch.alternatives
    : [{ shopName: priceMatch.shopName, price: priceMatch.price }];
  return [
    `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
    alternatives.map(formatPriceMatchTooltipOffer).join("\n"),
  ].join("\n\n");
}
function isFlightSearchPriceMatch(priceMatch: PriceMatchOffer): boolean {
  return priceMatch.source === "finnreise" ||
    priceMatch.source === "panflights" ||
    priceMatch.source === "momondo" ||
    priceMatch.source === "skyscanner" ||
    priceMatch.source === "travellink" ||
    priceMatch.source === "tripcom";
}
function formatPriceMatchTooltipOffer(offer: Pick<PriceMatchAlternative, "shopName" | "price" | "platform" | "shippingPrice" | "totalPrice">): string {
  const details = [
    offer.platform,
    offer.totalPrice !== undefined
      ? `${offer.shippingPrice ?? "frakt"}, totalt ${offer.totalPrice}`
      : offer.shippingPrice,
  ].filter((detail): detail is string => detail !== undefined && detail.length > 0);
  const detailsSuffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return `- ${offer.shopName} ${offer.price}${detailsSuffix}`;
}
function formatProviderName(provider: CashbackOffer["provider"]): string {
  return PROVIDER_NAMES[provider] ?? provider;
}
function findSiteIconUrl(): string {
  const iconSelectors = [
    'link[rel~="icon"][href]',
    'link[rel="shortcut icon"][href]',
    'link[rel="apple-touch-icon"][href]',
  ];
  for (const selector of iconSelectors) {
    const iconElement = document.querySelector(selector);
    if (!(iconElement instanceof HTMLLinkElement)) {
      continue;
    }
    const parsedUrl = parseUrlWithBase(iconElement.href, window.location.href);
    if (parsedUrl !== undefined) {
      return parsedUrl.toString();
    }
  }
  return new URL("/favicon.ico", window.location.origin).toString();
}
function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}
const WARNING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
function hasRateBreakdown(terms: string): boolean {
  return terms.includes("\n") && /\d+.*%/.test(terms);
}
async function detectAdblock(): Promise<boolean> {
  const [urlBlocked, domBlocked] = await Promise.all([
    detectAdblockByUrl(),
    detectAdblockByDom(),
  ]);
  return urlBlocked || domBlocked;
}

async function detectAdblockByUrl(): Promise<boolean> {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    await fetch("https://widgets.outbrain.com/outbrain.js", { mode: "no-cors", signal: controller.signal });
    clearTimeout(timeoutId);
    return false;
  } catch {
    return true;
  }
}

async function detectAdblockByDom(): Promise<boolean> {
  try {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
    for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
      const el = document.createElement("div");
      el.id = id;
      el.style.cssText = "display:block;width:1px;height:1px;";
      container.appendChild(el);
    }
    (document.body ?? document.documentElement).appendChild(container);
    await new Promise<void>((r) => setTimeout(r, 100));
    let blockedCount = 0;
    for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
      const el = container.querySelector(`#${id}`) as HTMLElement | null;
      if (!el || el.offsetHeight === 0) blockedCount++;
    }
    container.remove();
    return blockedCount >= 1;
  } catch {
    return false;
  }
}
async function detectConflicts(shadowRoot: ShadowRoot, titleEl: HTMLElement): Promise<void> {
  if (!await detectAdblock()) return;
  const warningIcon = document.createElement("span");
  warningIcon.className = "conflict-warning";
  warningIcon.innerHTML = WARNING_ICON_SVG;
  const conflictTooltip = document.createElement("div");
  conflictTooltip.className = "status-tooltip";
  conflictTooltip.textContent = "Adblock er aktivert – kan blokkere cashback-sporing";
  shadowRoot.append(conflictTooltip);
  warningIcon.addEventListener("mouseenter", () => {
    positionStatusTooltipAbovePanel(conflictTooltip, warningIcon, shadowRoot);
    shadowRoot.append(conflictTooltip);
    conflictTooltip.classList.add("visible");
  });
  warningIcon.addEventListener("mouseleave", () => {
    conflictTooltip.classList.remove("visible");
  });
  titleEl.appendChild(warningIcon);
}

function positionStatusTooltipAbovePanel(
  tooltip: HTMLElement,
  anchor: HTMLElement,
  shadowRoot: ShadowRoot,
): void {
  const panel = shadowRoot.querySelector<HTMLElement>(".panel");
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel?.getBoundingClientRect();

  tooltip.style.left = "-9999px";
  tooltip.style.top = "-9999px";
  tooltip.style.transform = "none";
  tooltip.classList.add("visible");

  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const preferredLeft = panelRect !== undefined ? panelRect.left : anchorRect.left;
  const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - tooltipWidth - 8));
  const preferredTop = panelRect !== undefined ? panelRect.top - tooltipHeight - 8 : anchorRect.top - tooltipHeight - 8;
  const fallbackTop = panelRect !== undefined ? panelRect.top + 8 : anchorRect.bottom + 8;
  const top = preferredTop >= 8
    ? preferredTop
    : Math.min(fallbackTop, window.innerHeight - tooltipHeight - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}
function positionTooltipRightOfPanel(
  tooltip: HTMLElement,
  anchor: HTMLElement,
  shadowRoot: ShadowRoot,
): void {
  const panelEl = shadowRoot.querySelector(".panel");
  const panelRect = panelEl?.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  tooltip.style.left = "-9999px";
  tooltip.style.top = "-9999px";
  tooltip.style.transform = "none";
  tooltip.classList.add("visible");

  const tooltipHeight = tooltip.offsetHeight;
  const tooltipWidth = tooltip.offsetWidth;
  const rightEdge = panelRect ? panelRect.right + 6 : anchorRect.right + 6;
  const fallbackLeft = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  const left = rightEdge + tooltipWidth > window.innerWidth - 8
    ? Math.max(8, Math.min(fallbackLeft, window.innerWidth - tooltipWidth - 8))
    : rightEdge;
  const top = Math.max(
    8,
    Math.min(anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8),
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
function formatOfferTitlePrefix(offer: CashbackOffer): string {
  if (offer.provider === "obos" || offer.provider === "bob" || offer.provider === "usbl") {
    return formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
  }
  return "Cashback";
}
function formatSideTabText(
  cashbackOffer: CashbackOffer | undefined,
  primaryOffer: CashbackOffer,
): string {
  if (cashbackOffer !== undefined) {
    const reward = formatCompactRewardLabel(cashbackOffer) ?? formatRewardLabel(cashbackOffer.reward, cashbackOffer.provider);
    return `${reward} ${formatProviderName(cashbackOffer.provider)}`;
  }
  return formatCompactRewardLabel(primaryOffer) ?? "Rabattkode";
}
function addChipTooltip(chip: HTMLElement, text: string, shadowRoot: ShadowRoot): void {
  const tooltip = document.createElement("div");
  tooltip.className = "bonus-chip-tooltip";
  tooltip.textContent = text;
  shadowRoot.append(tooltip);
  chip.addEventListener("mouseenter", () => {
    const panelEl = shadowRoot.querySelector(".panel");
    const panelRect = panelEl?.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
    tooltip.classList.add("visible");
    const tooltipHeight = tooltip.offsetHeight;
    const rightEdge = panelRect ? panelRect.right + 6 : rect.right + 6;
    tooltip.style.left = `${rightEdge}px`;
    tooltip.style.top = `${rect.top + rect.height / 2 - tooltipHeight / 2}px`;
    tooltip.style.transform = "none";
  });
  chip.addEventListener("mouseleave", () => {
    tooltip.classList.remove("visible");
  });
}
