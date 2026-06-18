/* eslint-disable @typescript-eslint/no-explicit-any */
export function initGame(): () => void {
  const BASE = 'https://gujeuk.dsmhs.kr'
  const TOKEN_KEY = 'gujuk_pet_token'
  let token: string | null = localStorage.getItem(TOKEN_KEY)

  async function api<T = any>(method: string, path: string, body?: object): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `서버 오류 (${res.status})`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  const SPRITES: Record<string, string[]> = {"mong": ["<svg viewBox=\"18 28 200 244\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g>\n    <ellipse cx=\"118\" cy=\"250\" rx=\"42\" ry=\"8\" fill=\"#000\" opacity=\"0.06\"/>\n    <path fill=\"#FBE3D0\" d=\"M118 120 C150 120 168 168 168 200 C168 234 146 256 118 256 C90 256 68 234 68 200 C68 168 86 120 118 120 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"106\" cy=\"168\" rx=\"14\" ry=\"9\" fill=\"#FEF5EC\"/>\n    <path d=\"M130 150 l8 8 l-8 8 l8 8\" stroke=\"#C9A48C\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n    <circle cx=\"106\" cy=\"205\" r=\"3\" fill=\"#4A3A30\"/>\n    <circle cx=\"130\" cy=\"205\" r=\"3\" fill=\"#4A3A30\"/>\n    <path d=\"M112 216 Q118 221 124 216\" stroke=\"#C9A48C\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/>\n    \n  </g></svg>","<svg viewBox=\"255 28 200 244\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g>\n    <ellipse cx=\"355\" cy=\"258\" rx=\"50\" ry=\"9\" fill=\"#000\" opacity=\"0.06\"/>\n    \n    <path fill=\"#FEF5EC\" d=\"M312 214 L320 196 L330 212 L340 192 L351 210 L362 190 L373 210 L384 194 L394 212 C400 240 396 258 355 258 C314 258 310 240 312 214 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <g>\n      \n      <ellipse cx=\"320\" cy=\"150\" rx=\"15\" ry=\"17\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n      <ellipse cx=\"320\" cy=\"152\" rx=\"7\" ry=\"9\" fill=\"#F4B6C6\"/>\n      <ellipse cx=\"390\" cy=\"150\" rx=\"15\" ry=\"17\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n      <ellipse cx=\"390\" cy=\"152\" rx=\"7\" ry=\"9\" fill=\"#F4B6C6\"/>\n      <circle cx=\"355\" cy=\"168\" r=\"48\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n      <ellipse cx=\"355\" cy=\"186\" rx=\"26\" ry=\"19\" fill=\"#FEF5EC\"/>\n      <circle cx=\"326\" cy=\"180\" r=\"8.5\" fill=\"#F7A0B4\" opacity=\"0.5\"/>\n      <circle cx=\"384\" cy=\"180\" r=\"8.5\" fill=\"#F7A0B4\" opacity=\"0.5\"/>\n      \n      <ellipse cx=\"338\" cy=\"166\" rx=\"11\" ry=\"14\" fill=\"#4A3A30\"/>\n      <ellipse cx=\"372\" cy=\"166\" rx=\"11\" ry=\"14\" fill=\"#4A3A30\"/>\n      <circle cx=\"334\" cy=\"160\" r=\"4.2\" fill=\"#fff\"/>\n      <circle cx=\"368\" cy=\"160\" r=\"4.2\" fill=\"#fff\"/>\n      <circle cx=\"342\" cy=\"171\" r=\"2\" fill=\"#fff\" opacity=\"0.8\"/>\n      <circle cx=\"376\" cy=\"171\" r=\"2\" fill=\"#fff\" opacity=\"0.8\"/>\n      \n      <ellipse cx=\"355\" cy=\"190\" rx=\"5.5\" ry=\"6.5\" fill=\"#B97A5E\"/>\n    </g>\n    \n  </g></svg>","<svg viewBox=\"490 28 200 244\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g>\n    <ellipse cx=\"590\" cy=\"262\" rx=\"60\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/>\n    <ellipse cx=\"650\" cy=\"196\" rx=\"14\" ry=\"18\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M566 110 C544 100 524 118 524 148 C524 174 540 186 560 178 C567 174 568 138 566 110 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M560 126 C544 119 533 132 535 152 C537 168 548 178 558 168 C563 161 562 140 560 126 Z\"/>\n    <path fill=\"#FBE3D0\" d=\"M614 110 C636 100 656 118 656 148 C656 174 640 186 620 178 C613 174 612 138 614 110 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M620 126 C636 119 647 132 645 152 C643 168 632 178 622 168 C617 161 618 140 620 126 Z\"/>\n    \n    <ellipse cx=\"566\" cy=\"248\" rx=\"19\" ry=\"12\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"614\" cy=\"248\" rx=\"19\" ry=\"12\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M590 158 C632 158 650 186 650 210 C650 238 624 250 590 250 C556 250 530 238 530 210 C530 186 548 158 590 158 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <ellipse cx=\"544\" cy=\"222\" rx=\"12\" ry=\"14\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"636\" cy=\"222\" rx=\"12\" ry=\"14\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <circle cx=\"590\" cy=\"120\" r=\"56\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"590\" cy=\"200\" rx=\"34\" ry=\"30\" fill=\"#FEF5EC\"/>\n    <ellipse cx=\"590\" cy=\"139\" rx=\"30\" ry=\"23\" fill=\"#FEF5EC\"/>\n    <circle cx=\"551\" cy=\"132\" r=\"10\" fill=\"#F7A0B4\" opacity=\"0.5\"/>\n    <circle cx=\"629\" cy=\"132\" r=\"10\" fill=\"#F7A0B4\" opacity=\"0.5\"/>\n    \n    <ellipse cx=\"572\" cy=\"116\" rx=\"11.5\" ry=\"14.5\" fill=\"#4A3A30\"/>\n    <ellipse cx=\"608\" cy=\"116\" rx=\"11.5\" ry=\"14.5\" fill=\"#4A3A30\"/>\n    <circle cx=\"567\" cy=\"109\" r=\"4.3\" fill=\"#fff\"/>\n    <circle cx=\"603\" cy=\"109\" r=\"4.3\" fill=\"#fff\"/>\n    <circle cx=\"576\" cy=\"122\" r=\"2.2\" fill=\"#fff\" opacity=\"0.85\"/>\n    <circle cx=\"612\" cy=\"122\" r=\"2.2\" fill=\"#fff\" opacity=\"0.85\"/>\n    \n    <ellipse cx=\"590\" cy=\"139\" rx=\"6\" ry=\"4.5\" fill=\"#B97A5E\"/>\n    <path d=\"M590 143 Q582 152 575 147 M590 143 Q598 152 605 147\" stroke=\"#B97A5E\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n    <path d=\"M585 149 Q590 160 595 149 Q590 154 585 149 Z\" fill=\"#F4889F\"/>\n    \n  </g></svg>","<svg viewBox=\"730 28 200 244\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g>\n    <ellipse cx=\"830\" cy=\"266\" rx=\"62\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/>\n    <ellipse cx=\"892\" cy=\"198\" rx=\"14\" ry=\"18\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M800 120 C780 116 766 134 766 160 C766 182 780 192 796 184 C803 180 802 142 800 120 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M795 136 C781 131 772 144 774 162 C776 176 786 184 794 175 C798 168 797 148 795 136 Z\"/>\n    <path fill=\"#FBE3D0\" d=\"M860 120 C880 116 894 134 894 160 C894 182 880 192 864 184 C857 180 858 142 860 120 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M865 136 C879 131 888 144 886 162 C884 176 874 184 866 175 C862 168 863 148 865 136 Z\"/>\n    \n    <ellipse cx=\"806\" cy=\"252\" rx=\"19\" ry=\"12\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"854\" cy=\"252\" rx=\"19\" ry=\"12\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M830 150 C872 150 892 182 892 212 C892 244 864 256 830 256 C796 256 768 244 768 212 C768 182 788 150 830 150 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"782\" cy=\"222\" rx=\"12\" ry=\"15\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"878\" cy=\"222\" rx=\"12\" ry=\"15\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"830\" cy=\"206\" rx=\"36\" ry=\"34\" fill=\"#FEF5EC\"/>\n    \n    <circle cx=\"830\" cy=\"118\" r=\"58\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#5B9BD5\" d=\"M790 98 A52 52 0 0 1 870 98 Q830 108 790 98 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#3E78B5\" d=\"M796 100 Q830 95 864 100 Q867 108 830 110 Q793 108 796 100 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <circle cx=\"830\" cy=\"52\" r=\"5\" fill=\"#3E78B5\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"830\" cy=\"140\" rx=\"30\" ry=\"22\" fill=\"#FEF5EC\"/>\n    <circle cx=\"793\" cy=\"134\" r=\"9.5\" fill=\"#F7A0B4\" opacity=\"0.45\"/>\n    <circle cx=\"867\" cy=\"134\" r=\"9.5\" fill=\"#F7A0B4\" opacity=\"0.45\"/>\n    <ellipse cx=\"813\" cy=\"120\" rx=\"10\" ry=\"13\" fill=\"#4A3A30\"/>\n    <ellipse cx=\"847\" cy=\"120\" rx=\"10\" ry=\"13\" fill=\"#4A3A30\"/>\n    <circle cx=\"809\" cy=\"114\" r=\"3.8\" fill=\"#fff\"/>\n    <circle cx=\"843\" cy=\"114\" r=\"3.8\" fill=\"#fff\"/>\n    <ellipse cx=\"830\" cy=\"140\" rx=\"5.6\" ry=\"4.2\" fill=\"#B97A5E\"/>\n    <path d=\"M820 146 Q830 154 840 146\" stroke=\"#B97A5E\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n    \n  </g></svg>","<svg viewBox=\"965 28 200 244\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g>\n    <ellipse cx=\"1065\" cy=\"270\" rx=\"70\" ry=\"11\" fill=\"#000\" opacity=\"0.06\"/>\n    \n    <ellipse cx=\"1133\" cy=\"196\" rx=\"17\" ry=\"22\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1141\" cy=\"182\" rx=\"10\" ry=\"13\" fill=\"#FBE3D0\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M1036 100 C1012 88 988 110 988 152 C988 188 1008 206 1034 192 C1043 187 1046 140 1036 100 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M1028 120 C1008 110 994 128 996 156 C998 180 1012 192 1024 178 C1031 168 1030 142 1028 120 Z\"/>\n    <path fill=\"#FBE3D0\" d=\"M1094 100 C1118 88 1142 110 1142 152 C1142 188 1122 206 1096 192 C1087 187 1084 140 1094 100 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#F4B6C6\" d=\"M1102 120 C1122 110 1136 128 1134 156 C1132 180 1118 192 1106 178 C1099 168 1100 142 1102 120 Z\"/>\n    \n    <ellipse cx=\"1036\" cy=\"256\" rx=\"21\" ry=\"13\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1094\" cy=\"256\" rx=\"21\" ry=\"13\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#FBE3D0\" d=\"M1065 146 C1116 146 1140 184 1140 216 C1140 252 1108 268 1065 268 C1022 268 990 252 990 216 C990 184 1014 146 1065 146 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1012\" cy=\"226\" rx=\"13\" ry=\"16\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1118\" cy=\"226\" rx=\"13\" ry=\"16\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1065\" cy=\"210\" rx=\"42\" ry=\"38\" fill=\"#FEF5EC\"/>\n    \n    <path fill=\"#5DCAA5\" d=\"M1028 168 C1048 182 1082 182 1102 168 L1098 182 C1078 194 1052 194 1032 182 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#1D9E75\" d=\"M1086 178 l12 26 l-14 -4 l-3 -18 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <circle cx=\"1065\" cy=\"104\" r=\"64\" fill=\"#FBE3D0\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"1065\" cy=\"128\" rx=\"34\" ry=\"26\" fill=\"#FEF5EC\"/>\n    <circle cx=\"1022\" cy=\"120\" r=\"11\" fill=\"#F7A0B4\" opacity=\"0.45\"/>\n    <circle cx=\"1108\" cy=\"120\" r=\"11\" fill=\"#F7A0B4\" opacity=\"0.45\"/>\n    <ellipse cx=\"1045\" cy=\"100\" rx=\"12\" ry=\"15\" fill=\"#4A3A30\"/>\n    <ellipse cx=\"1085\" cy=\"100\" rx=\"12\" ry=\"15\" fill=\"#4A3A30\"/>\n    <circle cx=\"1040\" cy=\"93\" r=\"4.5\" fill=\"#fff\"/>\n    <circle cx=\"1080\" cy=\"93\" r=\"4.5\" fill=\"#fff\"/>\n    <circle cx=\"1050\" cy=\"106\" r=\"2.3\" fill=\"#fff\" opacity=\"0.85\"/>\n    <circle cx=\"1090\" cy=\"106\" r=\"2.3\" fill=\"#fff\" opacity=\"0.85\"/>\n    <ellipse cx=\"1065\" cy=\"126\" rx=\"6.6\" ry=\"5\" fill=\"#B97A5E\"/>\n    <path d=\"M1065 131 Q1056 142 1046 136 M1065 131 Q1074 142 1084 136\" stroke=\"#B97A5E\" stroke-width=\"3.2\" fill=\"none\" stroke-linecap=\"round\"/>\n    \n  </g></svg>"], "posil": ["<svg viewBox=\"18 20 200 280\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g transform=\"translate(-2,0)\">\n    <ellipse cx=\"120\" cy=\"290\" rx=\"58\" ry=\"9\" fill=\"#000\" opacity=\"0.06\"/>\n    \n    <path fill=\"none\" stroke-width=\"5\" d=\"M120 210 C120 198 120 190 120 184\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>\n    <path fill=\"#8FCB5E\" d=\"M119 196 C108 188 95 190 91 199 C100 208 114 207 119 200 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#97C459\" d=\"M121 190 C132 182 146 184 150 193 C140 202 126 200 121 194 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    \n    <path fill=\"#E59A6B\" d=\"M70 226 L170 226 L156 286 L84 286 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <path fill=\"#E3A578\" d=\"M60 214 L180 214 L172 232 L68 232 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/>\n    <ellipse cx=\"120\" cy=\"221\" rx=\"52\" ry=\"7\" fill=\"#7C5230\"/>\n    <ellipse cx=\"108\" cy=\"219\" rx=\"6\" ry=\"3.5\" fill=\"#5E3E22\"/>\n    <ellipse cx=\"132\" cy=\"220\" rx=\"5\" ry=\"3\" fill=\"#5E3E22\"/>\n    \n  </g></svg>","<svg viewBox=\"254 20 200 280\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g transform=\"translate(234,0)\"><ellipse cx=\"120\" cy=\"290\" rx=\"60\" ry=\"9\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"none\" stroke-width=\"5\" d=\"M120 168 C120 156 120 148 120 140\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#8FCB5E\" d=\"M118 152 C104 142 88 144 83 155 C94 166 112 165 118 157 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#97C459\" d=\"M122 146 C136 136 152 138 157 149 C146 160 128 158 122 150 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#AEDD83\" d=\"M120 168 C146 168 164 188 164 208 C164 230 144 244 120 244 C96 244 76 230 76 208 C76 188 94 168 120 168 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"206\" rx=\"22\" ry=\"22\" fill=\"#D6EFB0\"/><path fill=\"#E59A6B\" d=\"M74 226 L166 226 L154 286 L86 286 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#E3A578\" d=\"M64 214 L176 214 L168 232 L72 232 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"221\" rx=\"50\" ry=\"6\" fill=\"#C97E52\" opacity=\"0.4\"/><circle cx=\"100\" cy=\"206\" r=\"7\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"140\" cy=\"206\" r=\"7\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"110\" cy=\"198\" rx=\"7.5\" ry=\"9.5\" fill=\"#3A4A2E\"/><ellipse cx=\"130\" cy=\"198\" rx=\"7.5\" ry=\"9.5\" fill=\"#3A4A2E\"/><circle cx=\"107\" cy=\"194\" r=\"2.8\" fill=\"#fff\"/><circle cx=\"127\" cy=\"194\" r=\"2.8\" fill=\"#fff\"/><path d=\"M114 209 Q120 214 126 209\" stroke=\"#3A4A2E\" stroke-width=\"2.6\" fill=\"none\" stroke-linecap=\"round\"/></g></svg>","<svg viewBox=\"490 20 200 280\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g transform=\"translate(470,0)\"><ellipse cx=\"120\" cy=\"290\" rx=\"62\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"none\" stroke-width=\"5.5\" d=\"M120 150 C120 134 120 124 120 114\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#8FCB5E\" d=\"M118 134 C102 122 82 124 75 137 C89 150 112 150 118 140 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#97C459\" d=\"M122 126 C138 114 158 116 165 129 C151 142 128 142 122 132 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M120 120 C112 106 116 90 124 84 C130 96 128 112 120 120 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M66 198 C46 192 30 199 28 214 C46 222 64 215 71 203 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M174 198 C194 192 210 199 212 214 C194 222 176 215 169 203 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#AEDD83\" d=\"M120 150 C152 150 174 178 174 202 C174 228 150 244 120 244 C90 244 66 228 66 202 C66 178 88 150 120 150 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"196\" rx=\"30\" ry=\"30\" fill=\"#D6EFB0\"/><path fill=\"#E59A6B\" d=\"M72 228 L168 228 L155 286 L85 286 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#E3A578\" d=\"M62 216 L178 216 L170 234 L70 234 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"223\" rx=\"52\" ry=\"6.5\" fill=\"#C97E52\" opacity=\"0.4\"/><circle cx=\"96\" cy=\"192\" r=\"9\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"144\" cy=\"192\" r=\"9\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"106\" cy=\"182\" rx=\"9.5\" ry=\"12.5\" fill=\"#3A4A2E\"/><ellipse cx=\"134\" cy=\"182\" rx=\"9.5\" ry=\"12.5\" fill=\"#3A4A2E\"/><circle cx=\"102\" cy=\"177\" r=\"3.6\" fill=\"#fff\"/><circle cx=\"130\" cy=\"177\" r=\"3.6\" fill=\"#fff\"/><path d=\"M112 196 Q120 203 128 196\" stroke=\"#3A4A2E\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/></g></svg>","<svg viewBox=\"726 20 200 280\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g transform=\"translate(706,0)\"><ellipse cx=\"120\" cy=\"290\" rx=\"64\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 132 C120 112 120 98 120 84\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#8FCB5E\" d=\"M118 116 C100 102 78 104 70 118 C84 134 110 134 118 122 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#97C459\" d=\"M122 108 C140 94 162 96 170 110 C156 126 130 126 122 114 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M108 84 C108 66 120 54 120 54 C120 54 132 66 132 84 C132 92 126 96 120 96 C114 96 108 92 108 84 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#F4A9C0\" d=\"M112 80 C112 64 120 52 120 52 C120 52 128 64 128 80 C128 88 124 92 120 92 C116 92 112 88 112 80 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M62 198 C40 190 22 197 20 214 C40 224 60 216 68 202 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M178 198 C200 190 218 197 220 214 C200 224 180 216 172 202 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#AEDD83\" d=\"M120 134 C158 134 182 168 182 196 C182 226 154 246 120 246 C86 246 58 226 58 196 C58 168 82 134 120 134 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"192\" rx=\"38\" ry=\"38\" fill=\"#D6EFB0\"/><path fill=\"#E59A6B\" d=\"M70 228 L170 228 L156 286 L84 286 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#E3A578\" d=\"M60 216 L180 216 L172 234 L68 234 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"223\" rx=\"54\" ry=\"7\" fill=\"#C97E52\" opacity=\"0.4\"/><circle cx=\"92\" cy=\"186\" r=\"10\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"148\" cy=\"186\" r=\"10\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"104\" cy=\"174\" rx=\"10.5\" ry=\"13.5\" fill=\"#3A4A2E\"/><ellipse cx=\"136\" cy=\"174\" rx=\"10.5\" ry=\"13.5\" fill=\"#3A4A2E\"/><circle cx=\"100\" cy=\"168\" r=\"4\" fill=\"#fff\"/><circle cx=\"132\" cy=\"168\" r=\"4\" fill=\"#fff\"/><path d=\"M110 188 Q120 195 130 188\" stroke=\"#3A4A2E\" stroke-width=\"3.2\" fill=\"none\" stroke-linecap=\"round\"/></g></svg>","<svg viewBox=\"962 20 200 280\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g transform=\"translate(942,0)\"><ellipse cx=\"120\" cy=\"290\" rx=\"66\" ry=\"10\" fill=\"#000\" opacity=\"0.07\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 116 C120 92 120 76 120 60\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#8FCB5E\" d=\"M118 96 C100 82 78 84 70 98 C84 114 108 114 118 102 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#97C459\" d=\"M122 86 C140 70 164 72 172 88 C156 106 132 104 122 92 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"120\" cy=\"44\" r=\"13\" fill=\"#F4A9C0\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"100\" cy=\"50\" r=\"13\" fill=\"#F4A9C0\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"140\" cy=\"50\" r=\"13\" fill=\"#F4A9C0\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"108\" cy=\"32\" r=\"13\" fill=\"#F7BBD0\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"132\" cy=\"32\" r=\"13\" fill=\"#F7BBD0\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"120\" cy=\"42\" r=\"10\" fill=\"#FBD46B\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M58 196 C34 188 16 196 14 214 C34 224 56 216 64 202 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#8FCB5E\" d=\"M182 196 C206 188 224 196 226 214 C206 224 184 216 176 202 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#AEDD83\" d=\"M120 110 C166 110 192 146 192 188 C192 226 160 248 120 248 C80 248 48 226 48 188 C48 146 74 110 120 110 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"180\" rx=\"42\" ry=\"44\" fill=\"#D6EFB0\"/><path fill=\"#E59A6B\" d=\"M70 226 L170 226 L156 286 L84 286 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#E3A578\" d=\"M60 214 L180 214 L172 232 L68 232 Z\" stroke=\"#3A4A2E\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"120\" cy=\"222\" rx=\"54\" ry=\"7\" fill=\"#C97E52\" opacity=\"0.4\"/><circle cx=\"86\" cy=\"172\" r=\"11\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"154\" cy=\"172\" r=\"11\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"102\" cy=\"160\" rx=\"12\" ry=\"15.5\" fill=\"#3A4A2E\"/><ellipse cx=\"138\" cy=\"160\" rx=\"12\" ry=\"15.5\" fill=\"#3A4A2E\"/><circle cx=\"97\" cy=\"153\" r=\"4.6\" fill=\"#fff\"/><circle cx=\"133\" cy=\"153\" r=\"4.6\" fill=\"#fff\"/><circle cx=\"106\" cy=\"166\" r=\"2.4\" fill=\"#fff\" opacity=\"0.85\"/><circle cx=\"142\" cy=\"166\" r=\"2.4\" fill=\"#fff\" opacity=\"0.85\"/><path d=\"M110 178 Q120 188 130 178\" stroke=\"#3A4A2E\" stroke-width=\"3.4\" fill=\"none\" stroke-linecap=\"round\"/></g></svg>"], "hoya": ["<svg viewBox=\"18 15 200 270\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g><ellipse cx=\"118\" cy=\"250\" rx=\"42\" ry=\"8\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"#FFF1DD\" d=\"M118 120 C150 120 168 168 168 200 C168 234 146 256 118 256 C90 256 68 234 68 200 C68 168 86 120 118 120 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#4A3A30\" d=\"M99 150 C102 158 102 172 99 180 C96 172 96 158 99 150 Z\"/><path fill=\"#4A3A30\" d=\"M118 144 C121 154 121 170 118 180 C115 170 115 154 118 144 Z\"/><path fill=\"#4A3A30\" d=\"M137 150 C140 158 140 172 137 180 C134 172 134 158 137 150 Z\"/><path d=\"M132 152 l7 7 l-7 7 l7 7\" stroke=\"#D8A06E\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"106\" cy=\"206\" r=\"3\" fill=\"#4A3A30\"/><circle cx=\"130\" cy=\"206\" r=\"3\" fill=\"#4A3A30\"/><path d=\"M112 216 Q118 221 124 216\" stroke=\"#B97A5E\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/></g></svg>","<svg viewBox=\"255 15 200 270\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g><ellipse cx=\"355\" cy=\"258\" rx=\"50\" ry=\"9\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"#FFF1DD\" d=\"M312 214 L320 196 L330 212 L340 192 L351 210 L362 190 L373 210 L384 194 L394 212 C400 240 396 258 355 258 C314 258 310 240 312 214 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#F6A64B\" d=\"M326 134 C322 118 340 116 345 130 C347 137 340 142 326 134 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M331 132 C329 122 338 121 341 130 C342 134 338 137 331 132 Z\"/><path fill=\"#F6A64B\" d=\"M384 134 C388 118 370 116 365 130 C363 137 370 142 384 134 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M379 132 C381 122 372 121 369 130 C368 134 372 137 379 132 Z\"/><circle cx=\"355\" cy=\"168\" r=\"48\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"355\" cy=\"186\" rx=\"26\" ry=\"19\" fill=\"#FFF1DD\"/><path fill=\"#4A3A30\" d=\"M355 142 C357 148 357 158 355 164 C353 158 353 148 355 142 Z\"/><path fill=\"#4A3A30\" d=\"M342 146 C344 151 344 160 342 165 C340 160 340 151 342 146 Z\"/><path fill=\"#4A3A30\" d=\"M368 146 C366 151 366 160 368 165 C370 160 370 151 368 146 Z\"/><circle cx=\"326\" cy=\"180\" r=\"8.5\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"384\" cy=\"180\" r=\"8.5\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"338\" cy=\"166\" rx=\"11\" ry=\"14\" fill=\"#4A3A30\"/><ellipse cx=\"372\" cy=\"166\" rx=\"11\" ry=\"14\" fill=\"#4A3A30\"/><circle cx=\"334\" cy=\"160\" r=\"4.2\" fill=\"#fff\"/><circle cx=\"368\" cy=\"160\" r=\"4.2\" fill=\"#fff\"/><circle cx=\"342\" cy=\"171\" r=\"2\" fill=\"#fff\" opacity=\"0.8\"/><circle cx=\"376\" cy=\"171\" r=\"2\" fill=\"#fff\" opacity=\"0.8\"/><path fill=\"#E08B9A\" stroke-width=\"2.4\" d=\"M349 182 Q355 181 361 182 Q359 188 355 191 Q351 188 349 182 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></g></svg>","<svg viewBox=\"490 15 200 270\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g><ellipse cx=\"590\" cy=\"262\" rx=\"60\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"#F6A64B\" d=\"M648 214 C672 214 686 196 682 174 C679 164 668 163 665 173 C669 191 657 203 644 208 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"679\" cy=\"173\" rx=\"6\" ry=\"7\" fill=\"#4A3A30\"/><path fill=\"#4A3A30\" d=\"M669 188 C672 184 672 178 668 177 C665 181 666 186 669 188 Z\"/><path fill=\"#F6A64B\" d=\"M555 78 C551 56 574 54 581 74 C584 84 575 90 555 78 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M562 75 C560 62 572 61 576 73 C578 79 573 83 562 75 Z\"/><path fill=\"#F6A64B\" d=\"M625 78 C629 56 606 54 599 74 C596 84 605 90 625 78 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M618 75 C620 62 608 61 604 73 C602 79 607 83 618 75 Z\"/><ellipse cx=\"566\" cy=\"248\" rx=\"19\" ry=\"12\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"614\" cy=\"248\" rx=\"19\" ry=\"12\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#F6A64B\" d=\"M590 158 C632 158 650 186 650 210 C650 238 624 250 590 250 C556 250 530 238 530 210 C530 186 548 158 590 158 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"544\" cy=\"222\" rx=\"12\" ry=\"14\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"636\" cy=\"222\" rx=\"12\" ry=\"14\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"590\" cy=\"120\" r=\"56\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"590\" cy=\"200\" rx=\"34\" ry=\"30\" fill=\"#FFF1DD\"/><ellipse cx=\"590\" cy=\"139\" rx=\"30\" ry=\"23\" fill=\"#FFF1DD\"/><path fill=\"#4A3A30\" d=\"M533 196 C541 199 547 204 550 210 C543 209 536 205 531 201 Z\"/><path fill=\"#4A3A30\" d=\"M647 196 C639 199 633 204 630 210 C637 209 644 205 649 201 Z\"/><path fill=\"#4A3A30\" d=\"M590 78 C592 85 592 96 590 102 C588 96 588 85 590 78 Z\"/><path fill=\"#4A3A30\" d=\"M575 84 C577 90 577 100 575 105 C573 100 573 90 575 84 Z\"/><path fill=\"#4A3A30\" d=\"M605 84 C603 90 603 100 605 105 C607 100 607 90 605 84 Z\"/><path fill=\"#4A3A30\" d=\"M536 116 C544 118 550 122 553 127 C546 126 539 123 535 120 Z\"/><path fill=\"#4A3A30\" d=\"M644 116 C636 118 630 122 627 127 C634 126 641 123 645 120 Z\"/><circle cx=\"551\" cy=\"134\" r=\"10\" fill=\"#F58CA3\" opacity=\"0.5\"/><circle cx=\"629\" cy=\"134\" r=\"10\" fill=\"#F58CA3\" opacity=\"0.5\"/><ellipse cx=\"572\" cy=\"116\" rx=\"11.5\" ry=\"14.5\" fill=\"#4A3A30\"/><ellipse cx=\"608\" cy=\"116\" rx=\"11.5\" ry=\"14.5\" fill=\"#4A3A30\"/><circle cx=\"567\" cy=\"109\" r=\"4.3\" fill=\"#fff\"/><circle cx=\"603\" cy=\"109\" r=\"4.3\" fill=\"#fff\"/><path fill=\"#E08B9A\" stroke-width=\"2.6\" d=\"M583 134 Q590 132 597 134 Q595 142 590 145 Q585 142 583 134 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#7A4030\" stroke-width=\"2.6\" d=\"M580 147 Q590 145 600 147 Q597 159 590 159 Q583 159 580 147 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#fff\" d=\"M585 148 L588 154 L591 148 Z\"/><path fill=\"#fff\" d=\"M591 148 L594 154 L597 148 Z\"/></g></svg>","<svg viewBox=\"730 15 200 270\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g><ellipse cx=\"830\" cy=\"266\" rx=\"62\" ry=\"10\" fill=\"#000\" opacity=\"0.06\"/><path fill=\"#F6A64B\" d=\"M888 216 C914 216 930 196 925 172 C922 161 910 160 907 171 C911 191 898 204 884 209 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"922\" cy=\"170\" rx=\"7\" ry=\"8\" fill=\"#4A3A30\"/><path fill=\"#4A3A30\" d=\"M911 187 C914 183 914 176 910 175 C906 180 907 185 911 187 Z\"/><path fill=\"#F6A64B\" d=\"M793 72 C789 48 814 46 821 68 C824 79 814 85 793 72 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M801 69 C799 55 812 54 816 67 C818 74 812 78 801 69 Z\"/><path fill=\"#F6A64B\" d=\"M867 72 C871 48 846 46 839 68 C836 79 846 85 867 72 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M859 69 C861 55 848 54 844 67 C842 74 848 78 859 69 Z\"/><ellipse cx=\"806\" cy=\"252\" rx=\"19\" ry=\"12\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"854\" cy=\"252\" rx=\"19\" ry=\"12\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#F6A64B\" d=\"M830 150 C872 150 892 182 892 212 C892 244 864 256 830 256 C796 256 768 244 768 212 C768 182 788 150 830 150 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"782\" cy=\"222\" rx=\"12\" ry=\"15\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"878\" cy=\"222\" rx=\"12\" ry=\"15\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"830\" cy=\"206\" rx=\"36\" ry=\"34\" fill=\"#FFF1DD\"/><circle cx=\"830\" cy=\"118\" r=\"58\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"830\" cy=\"140\" rx=\"30\" ry=\"22\" fill=\"#FFF1DD\"/><path fill=\"#E0563E\" d=\"M796 168 Q830 182 864 168 L860 180 Q830 192 800 180 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#C8432C\" d=\"M858 174 l14 10 l-12 4 l-6 -12 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#4A3A30\" d=\"M770 198 C778 201 784 206 787 212 C780 211 773 207 768 203 Z\"/><path fill=\"#4A3A30\" d=\"M890 198 C882 201 876 206 873 212 C880 211 887 207 892 203 Z\"/><path fill=\"#4A3A30\" d=\"M830 78 C832 85 832 96 830 102 C828 96 828 85 830 78 Z\"/><path fill=\"#4A3A30\" d=\"M816 84 C818 90 818 100 816 105 C814 100 814 90 816 84 Z\"/><path fill=\"#4A3A30\" d=\"M844 84 C842 90 842 100 844 105 C846 100 846 90 844 84 Z\"/><path fill=\"#4A3A30\" d=\"M778 116 C786 118 792 122 795 127 C788 126 781 123 777 120 Z\"/><path fill=\"#4A3A30\" d=\"M882 116 C874 118 868 122 865 127 C872 126 879 123 883 120 Z\"/><circle cx=\"793\" cy=\"134\" r=\"9.5\" fill=\"#F58CA3\" opacity=\"0.45\"/><circle cx=\"867\" cy=\"134\" r=\"9.5\" fill=\"#F58CA3\" opacity=\"0.45\"/><ellipse cx=\"813\" cy=\"120\" rx=\"10\" ry=\"13\" fill=\"#4A3A30\"/><ellipse cx=\"847\" cy=\"120\" rx=\"10\" ry=\"13\" fill=\"#4A3A30\"/><circle cx=\"809\" cy=\"114\" r=\"3.8\" fill=\"#fff\"/><circle cx=\"843\" cy=\"114\" r=\"3.8\" fill=\"#fff\"/><path fill=\"#E08B9A\" stroke-width=\"2.6\" d=\"M823 138 Q830 136 837 138 Q835 145 830 148 Q825 145 823 138 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M820 152 Q830 158 840 150\" stroke=\"#7A4030\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/><path fill=\"#fff\" stroke=\"#4A3A30\" stroke-width=\"1\" d=\"M824 150 L827 156 L830 151 Z\"/></g></svg>","<svg viewBox=\"965 15 200 270\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"xMidYMax meet\"><g><ellipse cx=\"1065\" cy=\"270\" rx=\"70\" ry=\"11\" fill=\"#000\" opacity=\"0.07\"/><path fill=\"#F6A64B\" d=\"M1128 216 C1158 216 1176 188 1170 158 C1167 145 1153 144 1149 157 C1154 181 1138 197 1122 205 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1166\" cy=\"156\" rx=\"8\" ry=\"9\" fill=\"#4A3A30\"/><path fill=\"#4A3A30\" d=\"M1154 176 C1157 171 1157 163 1152 162 C1148 168 1149 174 1154 176 Z\"/><path fill=\"#F6A64B\" d=\"M1024 60 C1019 32 1047 30 1055 54 C1058 66 1047 73 1024 60 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M1033 57 C1031 42 1045 41 1049 55 C1051 63 1044 67 1033 57 Z\"/><path fill=\"#F6A64B\" d=\"M1106 60 C1111 32 1083 30 1075 54 C1072 66 1083 73 1106 60 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#FFF1DD\" d=\"M1097 57 C1099 42 1085 41 1081 55 C1079 63 1086 67 1097 57 Z\"/><path fill=\"#FBD46B\" d=\"M1046 44 L1052 26 L1060 40 L1065 22 L1070 40 L1078 26 L1084 44 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><circle cx=\"1065\" cy=\"22\" r=\"3.5\" fill=\"#E0A93E\"/><ellipse cx=\"1036\" cy=\"256\" rx=\"21\" ry=\"13\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1094\" cy=\"256\" rx=\"21\" ry=\"13\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path fill=\"#F6A64B\" d=\"M1065 146 C1116 146 1140 184 1140 216 C1140 252 1108 268 1065 268 C1022 268 990 252 990 216 C990 184 1014 146 1065 146 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1012\" cy=\"226\" rx=\"13\" ry=\"16\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1118\" cy=\"226\" rx=\"13\" ry=\"16\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1065\" cy=\"210\" rx=\"42\" ry=\"38\" fill=\"#FFF1DD\"/><circle cx=\"1065\" cy=\"104\" r=\"64\" fill=\"#F6A64B\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><ellipse cx=\"1065\" cy=\"128\" rx=\"34\" ry=\"26\" fill=\"#FFF1DD\"/><path fill=\"#4A3A30\" d=\"M992 198 C1001 201 1008 207 1011 214 C1003 213 995 208 989 204 Z\"/><path fill=\"#4A3A30\" d=\"M994 224 C1003 226 1009 230 1012 235 C1004 234 996 230 991 227 Z\"/><path fill=\"#4A3A30\" d=\"M1138 198 C1129 201 1122 207 1119 214 C1127 213 1135 208 1141 204 Z\"/><path fill=\"#4A3A30\" d=\"M1136 224 C1127 226 1121 230 1118 235 C1126 234 1134 230 1139 227 Z\"/><path fill=\"#4A3A30\" d=\"M1065 60 C1067 68 1067 80 1065 88 C1063 80 1063 68 1065 60 Z\"/><path fill=\"#4A3A30\" d=\"M1048 66 C1050 73 1050 84 1048 90 C1046 84 1046 73 1048 66 Z\"/><path fill=\"#4A3A30\" d=\"M1082 66 C1080 73 1080 84 1082 90 C1084 84 1084 73 1082 66 Z\"/><path fill=\"#4A3A30\" d=\"M1006 102 C1015 104 1022 108 1025 114 C1017 113 1009 109 1004 105 Z\"/><path fill=\"#4A3A30\" d=\"M1124 102 C1115 104 1108 108 1105 114 C1113 113 1121 109 1126 105 Z\"/><circle cx=\"1022\" cy=\"120\" r=\"11\" fill=\"#F58CA3\" opacity=\"0.45\"/><circle cx=\"1108\" cy=\"120\" r=\"11\" fill=\"#F58CA3\" opacity=\"0.45\"/><ellipse cx=\"1045\" cy=\"100\" rx=\"12\" ry=\"15\" fill=\"#4A3A30\"/><ellipse cx=\"1085\" cy=\"100\" rx=\"12\" ry=\"15\" fill=\"#4A3A30\"/><circle cx=\"1040\" cy=\"93\" r=\"4.5\" fill=\"#fff\"/><circle cx=\"1080\" cy=\"93\" r=\"4.5\" fill=\"#fff\"/><circle cx=\"1050\" cy=\"106\" r=\"2.3\" fill=\"#fff\" opacity=\"0.85\"/><circle cx=\"1090\" cy=\"106\" r=\"2.3\" fill=\"#fff\" opacity=\"0.85\"/><path fill=\"#E08B9A\" stroke-width=\"2.8\" d=\"M1056 122 Q1065 120 1074 122 Q1071 131 1065 135 Q1059 131 1056 122 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#7A4030\" stroke-width=\"2.8\" d=\"M1052 138 Q1065 136 1078 138 Q1074 154 1065 154 Q1056 154 1052 138 Z\" stroke=\"#4A3A30\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path fill=\"#fff\" d=\"M1058 139 L1062 146 L1065 139 Z\"/><path fill=\"#fff\" d=\"M1065 139 L1068 146 L1072 139 Z\"/></g></svg>"]}

  const STAGES: Record<string, string[]> = {mong:['알','아기','어린이','청소년','어른'],posil:['씨앗','새싹','잎새','꽃봉오리','활짝'],hoya:['알','아기','어린이','청소년','어른']}
  const STAGE_XP = [0, 30, 80, 180, 350]
  const SPECIES: Record<string, string> = {mong:'펫',posil:'식물',hoya:'호랑이'}
  const META = [{id:'mong',name:'몽실이',badge:'pet',desc:'폭신폭신 강아지'},{id:'posil',name:'포실이',badge:'plant',desc:'화분 속 새싹'},{id:'hoya',name:'호야',badge:'tiger',desc:'씩씩한 호랑이'}]
  function isPlant(s: string) { return s === 'posil' }

  const OUTC = '#4A3A30'
  const ANCH: Record<string, (null | { head: number[]; body: number[] })[]> = {
    mong: [null,{head:[355,168,48],body:[355,212,46]},{head:[590,120,56],body:[590,205,60]},{head:[830,118,58],body:[830,205,62]},{head:[1065,104,64],body:[1065,207,75]}],
    posil: [null,{head:[354,196,40],body:[354,212,46]},{head:[590,186,50],body:[590,205,58]},{head:[826,180,58],body:[826,205,64]},{head:[1062,165,66],body:[1062,200,72]}],
    hoya: [null,{head:[355,168,48],body:[355,212,46]},{head:[590,120,56],body:[590,205,60]},{head:[830,118,58],body:[830,205,62]},{head:[1065,104,64],body:[1065,207,75]}],
  }
  function R(x: number) { return Math.round(x) }
  function mkHat(kind: string, h: number[]) {
    const hx=h[0],hy=h[1],hr=h[2]*1.18,sw=5.5
    if(kind==='cap'){const hw=hr*0.95,base=hy-hr*0.5,top=hy-hr*1.16;return'<path d="M'+R(hx-hw)+' '+R(base)+' C '+R(hx-hw)+' '+R(top)+' '+R(hx+hw)+' '+R(top)+' '+R(hx+hw)+' '+R(base)+' Q '+R(hx)+' '+R(base+8)+' '+R(hx-hw)+' '+R(base)+' Z" fill="#E0563E" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(hx-hw-hr*0.16)+' '+R(base)+' Q '+R(hx)+' '+R(base+hr*0.42)+' '+R(hx+hw+hr*0.16)+' '+R(base)+' Q '+R(hx)+' '+R(base+hr*0.16)+' '+R(hx-hw-hr*0.16)+' '+R(base)+' Z" fill="#C8432C" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><circle cx="'+R(hx)+'" cy="'+R(top+hr*0.06)+'" r="'+R(hr*0.09)+'" fill="#C8432C" stroke="'+OUTC+'" stroke-width="3"/>';}
    if(kind==='party'){const apex=hy-hr*1.62,base=hy-hr*0.42,hw=hr*0.64;return'<path d="M'+R(hx-hw)+' '+R(base)+' L '+R(hx)+' '+R(apex)+' L '+R(hx+hw)+' '+R(base)+' Z" fill="#F4C84B" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(hx-hw*0.5)+' '+R((base+apex)/2+hr*0.1)+' L '+R(hx+hw*0.1)+' '+R((base+apex)/2+hr*0.1)+'" stroke="#EF8FB0" stroke-width="4" stroke-linecap="round"/><circle cx="'+R(hx)+'" cy="'+R(apex)+'" r="'+R(hr*0.14)+'" fill="#EF8FB0" stroke="'+OUTC+'" stroke-width="3"/>';}
    if(kind==='beanie'){const hw=hr*0.97,base=hy-hr*0.4,top=hy-hr*1.12;return'<path d="M'+R(hx-hw)+' '+R(base)+' C '+R(hx-hw)+' '+R(top)+' '+R(hx+hw)+' '+R(top)+' '+R(hx+hw)+' '+R(base)+' Q '+R(hx)+' '+R(base+8)+' '+R(hx-hw)+' '+R(base)+' Z" fill="#5BA66B" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(hx-hw)+' '+R(base-hr*0.16)+' L '+R(hx+hw)+' '+R(base-hr*0.16)+' L '+R(hx+hw)+' '+R(base+hr*0.14)+' Q '+R(hx)+' '+R(base+hr*0.3)+' '+R(hx-hw)+' '+R(base+hr*0.14)+' Z" fill="#3E7E4C" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><circle cx="'+R(hx)+'" cy="'+R(top)+'" r="'+R(hr*0.16)+'" fill="#FFF1DD" stroke="'+OUTC+'" stroke-width="3"/>';}
    if(kind==='crown'){const base=hy-hr*0.45,hw=hr*0.82,top=hy-hr*1.15;return'<path d="M'+R(hx-hw)+' '+R(base)+' L '+R(hx-hw*0.55)+' '+R(top)+' L '+R(hx)+' '+R(base-hr*0.38)+' L '+R(hx+hw*0.55)+' '+R(top)+' L '+R(hx+hw)+' '+R(base)+' Z" fill="#FBD46B" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(hx-hw)+' '+R(base)+' Q '+R(hx)+' '+R(base+hr*0.18)+' '+R(hx+hw)+' '+R(base)+'" fill="none" stroke="#E0A93E" stroke-width="4" stroke-linecap="round"/><circle cx="'+R(hx-hw*0.55)+'" cy="'+R(top)+'" r="'+R(hr*0.09)+'" fill="#EF8FB0" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx)+'" cy="'+R(base-hr*0.38)+'" r="'+R(hr*0.09)+'" fill="#7EC0E8" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx+hw*0.55)+'" cy="'+R(top)+'" r="'+R(hr*0.09)+'" fill="#EF8FB0" stroke="'+OUTC+'" stroke-width="2.5"/>';}
    if(kind==='ribbon'){const cy=hy-hr*0.82,r=hr*0.24;return'<path d="M'+R(hx)+' '+R(cy)+' C '+R(hx-r*2.2)+' '+R(cy-r*1.2)+' '+R(hx-r*2.6)+' '+R(cy+r*1.1)+' '+R(hx-r*0.35)+' '+R(cy+r*0.4)+' Z" fill="#EF8FB0" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(hx)+' '+R(cy)+' C '+R(hx+r*2.2)+' '+R(cy-r*1.2)+' '+R(hx+r*2.6)+' '+R(cy+r*1.1)+' '+R(hx+r*0.35)+' '+R(cy+r*0.4)+' Z" fill="#EF8FB0" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><circle cx="'+R(hx)+'" cy="'+R(cy)+'" r="'+R(r*0.62)+'" fill="#E0567E" stroke="'+OUTC+'" stroke-width="3"/>';}
    if(kind==='flower'){const cy=hy-hr*0.92,r=hr*0.16;return'<circle cx="'+R(hx-r*1.25)+'" cy="'+R(cy)+'" r="'+R(r)+'" fill="#F7BBD0" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx+r*1.25)+'" cy="'+R(cy)+'" r="'+R(r)+'" fill="#F7BBD0" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx)+'" cy="'+R(cy-r*1.15)+'" r="'+R(r)+'" fill="#F7BBD0" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx)+'" cy="'+R(cy+r*1.15)+'" r="'+R(r)+'" fill="#F7BBD0" stroke="'+OUTC+'" stroke-width="2.5"/><circle cx="'+R(hx)+'" cy="'+R(cy)+'" r="'+R(r*0.8)+'" fill="#FBD46B" stroke="'+OUTC+'" stroke-width="2.5"/>';}
    return ''
  }
  function mkShirt(kind: string, b: number[]) {
    const bx=b[0],by=b[1],bw=b[2]*1.16,sw=5.5,top=by-bw*0.5,bot=by+bw*0.6,hw=bw*0.66
    const patch='M'+R(bx-hw)+' '+R(top)+' Q '+R(bx)+' '+R(top-bw*0.1)+' '+R(bx+hw)+' '+R(top)+' L '+R(bx+hw*0.86)+' '+R(bot)+' Q '+R(bx)+' '+R(bot+bw*0.12)+' '+R(bx-hw*0.86)+' '+R(bot)+' Z'
    if(kind==='stripe'){let s='<path d="'+patch+'" fill="#F2C14E" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/>';[0.34,0.58,0.82].forEach(f=>{const yy=top+(bot-top)*f;s+='<path d="M'+R(bx-hw*0.82)+' '+R(yy)+' Q '+R(bx)+' '+R(yy+5)+' '+R(bx+hw*0.82)+' '+R(yy)+'" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>';});return s;}
    if(kind==='heart'){const cx=bx,cy=(top+bot)/2+bw*0.05,r=bw*0.22;return'<path d="'+patch+'" fill="#7EC0E8" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(cx)+' '+R(cy+r*0.7)+' C '+R(cx-r*1.3)+' '+R(cy-r*0.4)+' '+R(cx-r*0.5)+' '+R(cy-r*1.1)+' '+R(cx)+' '+R(cy-r*0.3)+' C '+R(cx+r*0.5)+' '+R(cy-r*1.1)+' '+R(cx+r*1.3)+' '+R(cy-r*0.4)+' '+R(cx)+' '+R(cy+r*0.7)+' Z" fill="#E0563E"/>';}
    if(kind==='star'){const cx=bx,cy=(top+bot)/2+bw*0.02,r=bw*0.2;return'<path d="'+patch+'" fill="#7F77DD" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(cx)+' '+R(cy-r)+' L '+R(cx+r*0.25)+' '+R(cy-r*0.25)+' L '+R(cx+r)+' '+R(cy-r*0.2)+' L '+R(cx+r*0.42)+' '+R(cy+r*0.22)+' L '+R(cx+r*0.6)+' '+R(cy+r)+' L '+R(cx)+' '+R(cy+r*0.55)+' L '+R(cx-r*0.6)+' '+R(cy+r)+' L '+R(cx-r*0.42)+' '+R(cy+r*0.22)+' L '+R(cx-r)+' '+R(cy-r*0.2)+' L '+R(cx-r*0.25)+' '+R(cy-r*0.25)+' Z" fill="#FBD46B"/>';}
    if(kind==='hoodie'){const hoodTop=top-bw*0.18,hoodW=hw*0.62;return'<path d="'+patch+'" fill="#5BA66B" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/><path d="M'+R(bx-hoodW)+' '+R(top+bw*0.02)+' C '+R(bx-hoodW)+' '+R(hoodTop)+' '+R(bx+hoodW)+' '+R(hoodTop)+' '+R(bx+hoodW)+' '+R(top+bw*0.02)+' Q '+R(bx)+' '+R(top+bw*0.16)+' '+R(bx-hoodW)+' '+R(top+bw*0.02)+' Z" fill="#3E7E4C" stroke="'+OUTC+'" stroke-width="4" stroke-linejoin="round"/><path d="M'+R(bx-8)+' '+R(top+bw*0.18)+' L '+R(bx-12)+' '+R(top+bw*0.46)+' M '+R(bx+8)+' '+R(top+bw*0.18)+' L '+R(bx+12)+' '+R(top+bw*0.46)+'" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';}
    if(kind==='rainbow'){let s2='<path d="'+patch+'" fill="#FFF1DD" stroke="'+OUTC+'" stroke-width="'+sw+'" stroke-linejoin="round"/>';[['#E0563E',0.28],['#F2C14E',0.43],['#5BA66B',0.58],['#7EC0E8',0.73]].forEach(a=>{const yy=top+(bot-top)*(a[1] as number);s2+='<path d="M'+R(bx-hw*0.78)+' '+R(yy)+' Q '+R(bx)+' '+R(yy+5)+' '+R(bx+hw*0.78)+' '+R(yy)+'" stroke="'+a[0]+'" stroke-width="6" fill="none" stroke-linecap="round"/>';});return s2;}
    return ''
  }

  const SHOP: Record<string, any[]> = {
    hat:[
      {id:'cap',slot:'hat',ic:'🧢',n:'빨간 모자',cost:18},{id:'party',slot:'hat',ic:'🎉',n:'파티 고깔',cost:14},
      {id:'beanie',slot:'hat',ic:'🧶',n:'방울 비니',cost:20},{id:'crown',slot:'hat',ic:'👑',n:'작은 왕관',cost:26},
      {id:'ribbon',slot:'hat',ic:'🎀',n:'핑크 리본',cost:22},{id:'flower',slot:'hat',ic:'🌸',n:'꽃 머리핀',cost:18},
      {id:'stripe',slot:'shirt',ic:'👕',n:'줄무늬 티셔츠',cost:16},{id:'heart',slot:'shirt',ic:'💙',n:'하트 티셔츠',cost:16},
      {id:'star',slot:'shirt',ic:'⭐',n:'별 티셔츠',cost:19},{id:'hoodie',slot:'shirt',ic:'🧥',n:'초록 후드',cost:24},
      {id:'rainbow',slot:'shirt',ic:'🌈',n:'무지개 티셔츠',cost:22},
    ],
    prop:[
      {id:'ball',ic:'⚽',n:'공',d:'방에 통통 튀는 공을 놓아요',cost:10},{id:'balloon',ic:'🎈',n:'풍선',d:'둥실 떠다니는 풍선',cost:12},
      {id:'cushion',ic:'🛋️',n:'쿠션',d:'포근한 쿠션',cost:15},{id:'bone',ic:'🦴',n:'장난감 뼈다귀',d:'바닥에 귀여운 장난감을 놓아요',cost:11},
      {id:'gift',ic:'🎁',n:'선물 상자',d:'방 분위기를 더 즐겁게 만들어요',cost:18},{id:'lamp',ic:'🪔',n:'무드 램프',d:'방 한쪽에 따뜻한 조명을 놓아요',cost:24},
      {id:'teddy',ic:'🧸',n:'곰인형',d:'친구 옆에 포근한 인형을 놓아요',cost:20},{id:'flowerpot',ic:'🪴',n:'작은 화분',d:'방에 초록 포인트를 더해요',cost:16},
      {id:'book',ic:'📖',n:'그림책',d:'바닥에 작은 그림책을 펼쳐둬요',cost:13},
    ],
    buff:[
      {id:'slowdecay',ic:'🛡️',n:'든든 사료통',d:'오래 안 와도 스탯이 천천히 줄어요 (감소 ½)',cost:40},
      {id:'xpboost',ic:'📈',n:'성장 영양제',d:'돌보기·놀기 때 경험치 1.1배',cost:45},
      {id:'ptboost',ic:'⭐',n:'행운의 부적',d:'매일 접속 보너스 1.1배',cost:50},
    ],
  }
  function shopFind(id: string) { let r: any = null; ['hat','prop','buff'].forEach(c => { SHOP[c].forEach((it: any) => { if(it.id===id) r=it }) }); return r }
  function hasBuff(id: string) { return state && state.owned.buff.indexOf(id) >= 0 }

  function applyPetResponse(pet: any) {
    state = state || {}
    state.petId = pet.petId; state.species = pet.species; state.petName = pet.name
    state.stage = pet.stage; state.xp = pet.xp
    state.hunger = pet.stats.hunger; state.happy = pet.stats.happy; state.clean = pet.stats.clean; state.energy = pet.stats.energy
    state.points = pet.points; state.streak = pet.streak; state.maxStreak = pet.maxStreak; state.visits = pet.visits
    state.lastSeenAt = pet.lastSeenAt
    state.owned = { hat: [...pet.inventory.hat], shirt: [...pet.inventory.shirt], prop: [...pet.inventory.prop], buff: [...pet.inventory.buff] }
    state.equipped = { hat: pet.equipped.hat || null, shirt: pet.equipped.shirt || null }
    state.placed = [...pet.placedProps]
  }
  function applyDecay() {
    const now = Date.now(), lastSeen = state.lastSeenAt ? new Date(state.lastSeenAt).getTime() : now
    const hrs = Math.max(0, (now - lastSeen) / 3.6e6), decayHrs = Math.max(0, hrs - 48)
    const dm = hasBuff('slowdecay') ? 0.5 : 1
    if(decayHrs > 0){state.hunger=clamp(state.hunger-DECAY.hunger*decayHrs*dm);state.happy=clamp(state.happy-DECAY.happy*decayHrs*dm);state.clean=clamp(state.clean-DECAY.clean*decayHrs*dm);state.energy=clamp(state.energy-DECAY.energy*decayHrs*dm)}
  }
  let svT: ReturnType<typeof setTimeout> | null = null
  async function save() { try { if(!state) return; await api('POST', '/pets/me/sync', { stats: { hunger: Math.round(state.hunger), happy: Math.round(state.happy), clean: Math.round(state.clean), energy: Math.round(state.energy) } }) } catch(_) {} }
  function saveSoon() { if(svT) clearTimeout(svT); svT = setTimeout(save, 800) }

  function rnd(a: string[]) { return a[Math.floor(Math.random()*a.length)] }
  const L: Record<string, any> = {
    idle:{pet:['오늘 구즉 날씨 좋다~','심심해! 같이 놀자','히힛','뭐하고 놀까?','데구르르~'],plant:['햇볕 쬐고 싶다~','쑥쑥 클 거야!','잎사귀 반짝반짝','바람이 살랑~']},
    hungry:{pet:['배고파... 밥 줘ㅠ','꼬르륵...','뭔가 먹고 싶다!'],plant:['목말라... 물 주라~','흙이 말랐어ㅠ']},
    dirty:{pet:['찝찝해, 씻고 싶어','간지러워~'],plant:['잎에 먼지가...','반짝이고 싶어!']},
    tired:['하암~ 졸려','조금만 잘게...','에너지가 없어..'],
    lonely:['혼자라 심심해ㅠ','놀아주라~!','같이 있어줘'],
    full:['이미 충분해~ 다른 것도 챙겨줘!','그건 충분해, 딴 거 해줘~','꽉 찼어! 골고루~'],
    lowcond:['기운이 없어서 잘 안 커ㅠ 골고루 챙겨줘','컨디션이 별로야... 다 채워줘!','상태가 안 좋아서 잘 못 커ㅠ'],
    feed:{pet:['냠냠! 최고야!','맛있다~ 헤헤'],plant:['꿀꺽~ 시원해!','물 좋아!']},
    play:{pet:['꺄르르 신난다!','또 또!','재밌어!'],plant:['따뜻해 좋아~','광합성 중!']},
    clean:['뽀송뽀송!','깨끗해졌다!','반짝반짝~'],
    sleep:['잘 잤다!','쿨쿨... 개운해','충전 완료!'],
    click:{pet:['히힛 간지러워!','또 만져줘!','반가워!'],plant:['살랑살랑~','기분 좋아!']},
    dress:['어때, 잘 어울려?','멋지지? 헤헷','새 옷 좋아!'],
    growth:{pet:['나 컸어!! 봐봐~','한 단계 성장!'],plant:['쑥! 자랐어~','새 잎이 났어!']},
    daily:['또 왔구나! 반가워~','오늘도 출석 완료!','매일 와줘서 고마워~'],
    wbShort:['왔구나! 반가워~','히힛 또 왔네!'],
    wbMid:['어디 갔다 왔어? 기다렸잖아!','보고 싶었어!'],
    wbLong:['엄청 오랜만이다!! 보고 싶었어','와아 진짜 오랜만이야~'],
    wbSad:{pet:['흑흑 배고프고 외로웠어ㅠ','이제 왔어...? 기다렸어'],plant:['흙이 바싹 말랐어... 물 줘ㅠ','시들 뻔했어ㅠ']},
  }
  function line(cat: string) { const v = L[cat]; if(!v) return ''; if(Array.isArray(v)) return rnd(v); return rnd(v[state && isPlant(state.species) ? 'plant' : 'pet']) }

  let state: any = null
  function clamp(v: number) { return Math.max(0, Math.min(100, v)) }
  const DECAY = {hunger:7,happy:5,clean:4,energy:4}

  function $(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }
  function showScreen(id: string) { const ss = document.querySelectorAll('.screen'); ss.forEach(s => s.classList.remove('on')); $(id).classList.add('on') }

  function ensure(s: any) {
    s.owned = s.owned || {}; s.owned.hat = s.owned.hat || []; s.owned.shirt = s.owned.shirt || []; s.owned.prop = s.owned.prop || []; s.owned.buff = s.owned.buff || []
    s.equipped = s.equipped || {hat:null,shirt:null}; s.placed = s.placed || []
    if(s.points == null) s.points = 5
    return s
  }

  function fmtPhone(v: string) { v = v.replace(/[^0-9]/g,'').slice(0,11); if(v.length<4)return v; if(v.length<8)return v.slice(0,3)+'-'+v.slice(3); return v.slice(0,3)+'-'+v.slice(3,7)+'-'+v.slice(7) }
  function checkLogin() { const btn = $('loginBtn') as HTMLButtonElement; btn.disabled = !(($('nick') as HTMLInputElement).value.trim() && ($('loginPhone') as HTMLInputElement).value.replace(/[^0-9]/g,'').length >= 9) }

  let posX = 0, targetX = 0, moving = false, mode = 'idle', lastTs = 0, nextAt = 0, minX = 60, maxX = 320, centerX = 200
  let face: HTMLElement, petc: HTMLElement, room: HTMLElement, bubbleEl: HTMLElement, bubbleT: ReturnType<typeof setTimeout> | undefined, lastSpoke = 0, toastT: ReturnType<typeof setTimeout> | undefined
  let animId: number
  const intervals: ReturnType<typeof setInterval>[] = []

  function bounds() { const w = room.clientWidth; minX=54; maxX=w-54; centerX=w/2; if(maxX<minX)maxX=minX }
  function canWander() { return !isPlant(state.species) && state.stage >= 1 && mode === 'idle' }
  function applyPos() { petc.style.left = posX + 'px' }
  function setSprite() {
    const base = SPRITES[state.species][state.stage]; let extra = ''
    const a = ANCH[state.species][state.stage]
    if(a) { if(state.equipped.shirt) extra += mkShirt(state.equipped.shirt, a.body); if(state.equipped.hat) extra += mkHat(state.equipped.hat, a.head) }
    face.innerHTML = base.replace('</svg>', extra + '</svg>')
  }
  function placePet() { bounds(); if(!isPlant(state.species) && state.stage >= 1) { if(posX<minX||posX>maxX) posX=centerX } else posX=centerX; applyPos() }

  function petLoop(ts: number) {
    if(!lastTs) lastTs = ts; const dt = Math.min(0.05, (ts-lastTs)/1000); lastTs = ts
    if(moving) {
      const sp = 44*(state.energy<25?0.62:1); const d = Math.sign(targetX-posX); posX += d*sp*dt
      if((d>0&&posX>=targetX)||(d<0&&posX<=targetX)||Math.abs(targetX-posX)<1.2){posX=targetX;applyPos();arrive();}else applyPos()
    } else if(canWander() && ts > nextAt) { wander() }
    animId = requestAnimationFrame(petLoop)
  }
  function wander() { let t=0,tr=0; do{t=minX+Math.random()*(maxX-minX);tr++}while(Math.abs(t-posX)<60&&tr<8); targetX=t;moving=true;mode='walk';face.classList.remove('breathe');face.classList.add('walk') }
  function arrive() { moving=false;mode='idle';face.classList.remove('walk');face.classList.add('breathe');nextAt=performance.now()+(900+Math.random()*2400);if(Math.random()<0.3)hop() }
  function hop() { face.classList.remove('hop'); void (face as HTMLElement & {offsetWidth:number}).offsetWidth; face.classList.add('hop'); setTimeout(()=>{face.classList.remove('hop')},620) }
  function fxEl(em: string) { const e=document.createElement('div');e.className='fx';e.textContent=em;e.style.left=posX+'px';room.appendChild(e);setTimeout(()=>e.remove(),1000) }
  function bub(t: string, d?: number) { if(!t)return; bubbleEl.textContent=t;bubbleEl.classList.add('show');lastSpoke=performance.now();clearTimeout(bubbleT);bubbleT=setTimeout(()=>bubbleEl.classList.remove('show'),d||3200) }
  function speak(cat: string, d?: number) { bub(line(cat),d) }

  function renderProps() { const lay=$('propLayer');lay.innerHTML='';state.placed.forEach((id: string)=>{const it=shopFind(id);if(!it)return;const e=document.createElement('div');e.className='prop';e.id='pr_'+id;e.textContent=it.ic;lay.appendChild(e)}) }

  function setFill(k: string, f: string, p: string) {
    const v = Math.round(state[k]); const el = $(f)
    el.style.width = v + '%'
    el.style.background = v<25?'#E0613B':({hunger:'#E08A4E',happy:'#2FB182',clean:'#3F9CD6',energy:'#8B83E6'} as Record<string,string>)[k]
    $(p).textContent = String(v)
  }
  function render() {
    $('hname').textContent = state.petName
    $('hstage').textContent = SPECIES[state.species] + ' · ' + STAGES[state.species][state.stage] + ' 단계'
    $('hpts').textContent = state.points
    setFill('hunger','fHunger','pHunger');setFill('happy','fHappy','pHappy');setFill('clean','fClean','pClean');setFill('energy','fEnergy','pEnergy')
    const cur=STAGE_XP[state.stage],nx=STAGE_XP[state.stage+1]
    if(nx===undefined){$('xpText').textContent='최고 단계!';($('xpFill') as HTMLElement).style.width='100%';}
    else{const into=state.xp-cur,need=nx-cur;$('xpText').textContent=into+' / '+need;($('xpFill') as HTMLElement).style.width=Math.max(0,Math.min(100,into/need*100))+'%';}
    ;(document.querySelector('[data-a="feed"]') as HTMLButtonElement).disabled=state.points<1
    ;(document.querySelector('[data-a="play"]') as HTMLButtonElement).disabled=state.points<2
    ;(document.querySelector('[data-a="clean"]') as HTMLButtonElement).disabled=state.points<2
    ;(document.querySelector('[data-a="sleep"]') as HTMLButtonElement).disabled=state.points<1
    $('dailyInfo').textContent = state.checkedInToday?('🎁 오늘 출석 보너스 받았어요 · 연속 '+(state.streak||1)+'일 · 내일 또 만나요!'):'🎁 오늘의 출석 보너스를 받을 수 있어요'
  }

  function labels() {
    const pl = isPlant(state.species)
    $('lbFeed').textContent=pl?'수분':'배고픔';$('iFeed').textContent=pl?'💧':'🍖';$('tFeed').textContent=pl?'물주기':'밥주기'
    $('iPlay').textContent=pl?'☀️':'🎾';$('tPlay').textContent=pl?'햇볕':'놀기';$('tClean').textContent=pl?'잎청소':'씻기기'
    $('iSleep').textContent=pl?'🌙':'😴';$('tSleep').textContent=pl?'휴식':'재우기'
  }

  function stageFromXp(xp: number) { let s=0; for(let i=0;i<STAGE_XP.length;i++) if(xp>=STAGE_XP[i]) s=i; return s }
  function gainXp(n: number) { state.xp=(state.xp||0)+n;const ns=stageFromXp(state.xp);if(ns>(state.stage||0)){state.stage=ns;if(face){setSprite();placePet();fxEl('✨');setTimeout(()=>speak('growth',3600),250)}} }
  function actionXp(base: number, before: number, minStat: number) { const room2=(100-before)/100;const full=Math.max(0.04,Math.min(1,room2*1.3));const cond=minStat>=50?1:(0.4+0.6*(minStat/50));const x=base*full*cond*(hasBuff('xpboost')?1.1:1);return (before>=95)?0:Math.max(1,Math.round(x)) }

  const FREE: Record<string,{c:number}> = {feed:{c:1},play:{c:2},clean:{c:2},sleep:{c:1}}
  async function doFree(t: string) {
    const a=FREE[t];if(state.points<a.c){toast('포인트가 부족해요!');return}
    const btn=document.querySelector('[data-a="'+t+'"]') as HTMLButtonElement;btn.disabled=true
    moving=false;face.classList.remove('walk');mode='action'
    if(t==='sleep'){fxEl('💤');setTimeout(()=>{mode='idle';speak('sleep')},700)}
    else{hop();fxEl(t==='feed'?'🍖':t==='play'?'🎉':'✨');speak(t);setTimeout(()=>{if(mode==='action')mode='idle'},650)}
    try {
      const res=await api<any>('POST','/pets/me/actions',{action:t})
      state.points=res.points;state.hunger=res.stats.hunger;state.happy=res.stats.happy;state.clean=res.stats.clean;state.energy=res.stats.energy;state.xp=res.xp
      if(res.stage>state.stage){state.stage=res.stage;if(face){setSprite();placePet();fxEl('✨');setTimeout(()=>speak('growth',3600),250)}}
      render()
    } catch(err: any){toast(err.message||'오류가 발생했어요')} finally{btn.disabled=false}
  }
  function petClick() {
    if(state.stage===0){state.happy=clamp(state.happy+1);hop();fxEl('💗');bub(isPlant(state.species)?'쪼옥... (싹이 움직여요)':'콩콩... (안에서 소리가)',2400);render();saveSoon();return}
    state.happy=clamp(state.happy+2);moving=false;mode='action';hop();fxEl('💗');speak('click',2400);setTimeout(()=>{if(mode==='action')mode='idle'},620);render();saveSoon()
  }

  let shopTab = 'hat'
  function buildShop() {
    const l = $('shopList'); l.innerHTML = ''
    if(shopTab==='hat'){
      SHOP.hat.forEach((it:any)=>{
        const owned=state.owned[it.slot].indexOf(it.id)>=0,on=state.equipped[it.slot]===it.id
        let btn:string
        if(!owned)btn='<button class="ibtn" '+(state.points<it.cost?'disabled':'')+' data-buy="'+it.id+'">'+it.cost+' ⭐</button>'
        else btn='<button class="ibtn '+(on?'on':'own')+'" data-eq="'+it.id+'">'+(on?'착용중':'착용')+'</button>'
        l.appendChild(shopRow(it,'착용 아이템 · '+(it.slot==='hat'?'모자':'상의'),owned?'':(it.cost+' ⭐'),btn))
      })
    } else if(shopTab==='prop'){
      SHOP.prop.forEach((it:any)=>{
        const owned=state.owned.prop.indexOf(it.id)>=0,placed=state.placed.indexOf(it.id)>=0
        let btn:string
        if(!owned)btn='<button class="ibtn" '+(state.points<it.cost?'disabled':'')+' data-buy="'+it.id+'">'+it.cost+' ⭐</button>'
        else btn='<button class="ibtn '+(placed?'on':'own')+'" data-place="'+it.id+'">'+(placed?'배치중':'배치')+'</button>'
        l.appendChild(shopRow(it,it.d,owned?'':(it.cost+' ⭐'),btn))
      })
    } else {
      SHOP.buff.forEach((it:any)=>{
        const owned=hasBuff(it.id)
        const btn=owned?'<button class="ibtn have" disabled>보유중</button>':'<button class="ibtn" '+(state.points<it.cost?'disabled':'')+' data-buy="'+it.id+'">'+it.cost+' ⭐</button>'
        l.appendChild(shopRow(it,it.d,owned?'적용중 ✓':(it.cost+' ⭐'),btn))
      })
    }
    l.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buy((b as HTMLElement).dataset.buy!)))
    l.querySelectorAll('[data-eq]').forEach(b=>b.addEventListener('click',()=>toggleEquip((b as HTMLElement).dataset.eq!)))
    l.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>togglePlace((b as HTMLElement).dataset.place!)))
  }
  function shopRow(it: any, desc: string, price: string, btn: string) {
    const d=document.createElement('div');d.className='item'
    d.innerHTML='<div class="si">'+it.ic+'</div><div class="sib"><div class="sin">'+it.n+'</div><div class="sid">'+desc+'</div>'+(price?'<div class="price">'+price+'</div>':'')+'</div>'+btn;return d
  }
  async function buy(id: string) {
    const it=shopFind(id);if(!it)return
    try {
      const res=await api<any>('POST','/shop/purchase',{itemId:id,autoEquip:true})
      state.points=res.points
      state.owned={hat:[...res.inventory.hat],shirt:[...res.inventory.shirt],prop:[...res.inventory.prop],buff:[...res.inventory.buff]}
      state.equipped={hat:res.equipped.hat||null,shirt:res.equipped.shirt||null}
      if(it.slot){setSprite();speak('dress');hop();fxEl('✨')}
      else if(SHOP.prop.some((p:any)=>p.id===id)){if(!state.placed.includes(id))state.placed.push(id);renderProps()}
      else{fxEl('✨');toast(it.ic+' 효과 적용!')}
      render();buildShop()
    } catch(err: any){toast(err.message||'구매 실패')}
  }
  async function toggleEquip(id: string) {
    const it=shopFind(id);if(!it)return
    const newEquip={hat:state.equipped.hat,shirt:state.equipped.shirt};(newEquip as any)[it.slot]=(state.equipped[it.slot]===id)?null:id
    try {
      const res=await api<any>('PUT','/pets/me/equipment',newEquip)
      state.equipped={hat:res.equipped.hat||null,shirt:res.equipped.shirt||null}
      setSprite();if(state.equipped[it.slot])speak('dress');buildShop()
    } catch(err: any){toast(err.message||'오류가 발생했어요')}
  }
  async function togglePlace(id: string) {
    const newPlaced=[...state.placed];const i=newPlaced.indexOf(id);if(i>=0)newPlaced.splice(i,1);else newPlaced.push(id)
    try {
      const res=await api<any>('PUT','/pets/me/props',{placedProps:newPlaced})
      state.placed=res.placedProps;renderProps();buildShop()
    } catch(err: any){toast(err.message||'오류가 발생했어요')}
  }

  function toast(m: string) { const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2100) }

  function timeOfDay() {
    const h=new Date().getHours(),sky=$('sky'),ce=$('celest'),st=$('stars'),ng=$('night')
    if(h>=6&&h<=16){sky.setAttribute('fill','#BFE3F5');ce.setAttribute('fill','#FFD66B');ce.setAttribute('cx','100');ce.setAttribute('cy','26');st.setAttribute('opacity','0');(ng as HTMLElement).style.opacity='0'}
    else if(h>=17&&h<=19){sky.setAttribute('fill','#F4C39A');ce.setAttribute('fill','#FF9E5E');ce.setAttribute('cx','28');ce.setAttribute('cy','46');st.setAttribute('opacity','0');(ng as HTMLElement).style.opacity='.08'}
    else{sky.setAttribute('fill','#2E3A5C');ce.setAttribute('fill','#EAF0FF');ce.setAttribute('cx','100');ce.setAttribute('cy','24');st.setAttribute('opacity','1');(ng as HTMLElement).style.opacity='.3'}
  }

  function tick() { if(document.hidden)return;render();save() }
  function chatter() {
    if(document.hidden||mode==='action')return
    if(performance.now()-lastSpoke<4500)return
    let c='idle'
    if(state.energy<22&&Math.random()<0.6)c='tired';else if(state.hunger<28)c='hungry';else if(state.happy<28)c='lonely';else if(state.clean<26)c='dirty'
    if(Math.random()<0.78)speak(c);if(isPlant(state.species)&&state.stage>=1&&Math.random()<0.4)hop()
  }

  async function dailyAndWelcome() {
    const now=Date.now(),lastSeen=state.lastSeenAt?new Date(state.lastSeenAt).getTime():now
    const hrs=(now-lastSeen)/3.6e6,low=state.hunger<25||state.happy<22
    let cat:string|null=hrs<0.025?null:hrs<3?'wbShort':hrs<24?'wbMid':low?'wbSad':'wbLong'
    if(state.stage===0)cat=hrs<0.025?null:'wbShort'
    try {
      const res=await api<any>('POST','/checkin')
      state.points=res.points;state.streak=res.streak;state.maxStreak=res.maxStreak
      state.checkedInToday=true
      if(!res.alreadyCheckedIn&&res.awarded>0){
        state.visits=(state.visits||0)+1
        setTimeout(()=>toast('🎁 출석 보너스 +'+res.awarded+'P (연속 '+res.streak+'일)'),500)
        cat='daily'
      }
      render()
    } catch(_){}
    if(cat)setTimeout(()=>speak(cat!,4000),cat==='daily'?1400:700)
  }

  let wired = false
  function startGame() {
    showScreen('s-game')
    face=$('petface');petc=$('petc');room=$('room');bubbleEl=$('bubble')
    ensure(state);labels();setSprite();renderProps();timeOfDay()
    bounds();posX=centerX;applyPos();face.classList.add('breathe');placePet()
    dailyAndWelcome();render()
    if(!wired){wired=true
      document.querySelectorAll('.act[data-a]').forEach(b=>{b.addEventListener('click',()=>doFree((b as HTMLElement).dataset.a!))})
      face.addEventListener('click',petClick)
      $('shopBtn').addEventListener('click',()=>{
        shopTab='hat';const tabs=document.querySelectorAll('.tab');tabs.forEach(t=>t.classList.toggle('on',(t as HTMLElement).dataset.tab==='hat'))
        buildShop();$('shopModal').classList.add('on')
      })
      $('shopClose').addEventListener('click',()=>$('shopModal').classList.remove('on'))
      const tabs=document.querySelectorAll('.tab');tabs.forEach(tb=>{tb.addEventListener('click',()=>{shopTab=(tb as HTMLElement).dataset.tab!;tabs.forEach(t=>t.classList.remove('on'));tb.classList.add('on');buildShop()})})
      $('menuBtn').addEventListener('click',()=>{
        const bf=state.owned.buff.length
        $('menuStats').textContent=(state.userName||state.petName||'')+' · 방문 '+(state.visits||0)+'회 · 연속 '+(state.streak||0)+'일 · '+STAGES[state.species][state.stage]+' 단계 · 효과 '+bf+'개'
        $('menuModal').classList.add('on')
      })
      $('menuClose').addEventListener('click',()=>$('menuModal').classList.remove('on'))
      $('logoutBtn').addEventListener('click',()=>{$('menuModal').classList.remove('on');token=null;localStorage.removeItem(TOKEN_KEY);state=null;showScreen('s-login')})
      $('resetBtn').addEventListener('click',()=>{
        if(confirm('로그아웃할까요? 펫 데이터는 서버에 유지돼요.')){token=null;localStorage.removeItem(TOKEN_KEY);state=null;location.reload()}
      })
      window.addEventListener('resize',()=>{bounds();if(!moving)placePet()})
      document.addEventListener('visibilitychange',()=>{if(document.hidden)save();else lastTs=0})
      animId = requestAnimationFrame(petLoop)
      intervals.push(setInterval(tick,30000),setInterval(chatter,8500),setInterval(timeOfDay,60000))
      nextAt=performance.now()+1400
    }
  }

  // login screen init
  const nickEl = $('nick') as HTMLInputElement
  const phoneEl = $('loginPhone') as HTMLInputElement
  nickEl.addEventListener('input', checkLogin)
  phoneEl.addEventListener('input', () => { const c=phoneEl.selectionStart; phoneEl.value=fmtPhone(phoneEl.value); checkLogin(); void c })

  $('loginBtn').addEventListener('click', async () => {
    const name=nickEl.value.trim(), phone=phoneEl.value.replace(/[^0-9]/g,'')
    const btn=$('loginBtn') as HTMLButtonElement;btn.disabled=true;btn.textContent='로그인 중...'
    try {
      const res=await api<any>('POST','/auth/login',{name,phone})
      token=res.accessToken;localStorage.setItem(TOKEN_KEY,token!)
      state={userName:res.user?.name||name}
      if(!res.hasPet){buildPicks();showScreen('s-select')}
      else{const pet=await api<any>('GET','/pets/me');applyPetResponse(pet);state.userName=res.user?.name||name;applyDecay();startGame()}
    } catch(err: any){toast(err.message||'로그인 실패');btn.disabled=false;btn.textContent='로그인'}
  })

  const loginMascots = $('loginMascots')
  ;['mong','posil','hoya'].forEach(c=>{const d=document.createElement('div');d.className='mini';d.innerHTML=SPRITES[c][4];loginMascots.appendChild(d)})

  let pickSel: string|null = null
  function buildPicks() {
    const p=$('picks');p.innerHTML=''
    META.forEach(m=>{
      const d=document.createElement('div');d.className='pick';(d as any).dataset.id=m.id
      d.innerHTML='<div class="pv">'+SPRITES[m.id][4]+'</div><div class="pn">'+m.name+'</div><div><span class="badge '+m.badge+'">'+SPECIES[m.id]+'</span></div><div class="pd">'+m.desc+'</div>'
      d.addEventListener('click',()=>{p.querySelectorAll('.pick').forEach(x=>x.classList.remove('sel'));d.classList.add('sel');pickSel=m.id;$('nameWrap').classList.add('on');const pn=$('petname') as HTMLInputElement;if(!pn.value.trim())pn.value=m.name;checkSel()})
      p.appendChild(d)
    })
  }
  ;($('petname') as HTMLInputElement).addEventListener('input',checkSel)
  function checkSel() { const b=$('selStart') as HTMLButtonElement;b.disabled=!(pickSel&&($('petname') as HTMLInputElement).value.trim()) }
  $('selStart').addEventListener('click', async ()=>{
    const petName=($('petname') as HTMLInputElement).value.trim()
    const btn=$('selStart') as HTMLButtonElement;btn.disabled=true;btn.textContent='만드는 중...'
    try {
      const pet=await api<any>('POST','/pets',{species:pickSel,name:petName})
      applyPetResponse(pet);startGame()
    } catch(err: any){toast(err.message||'펫 만들기 실패');btn.disabled=false;btn.textContent='이 친구와 시작하기'}
  })

  ;(async()=>{
    if(token){
      try {
        const me=await api<any>('GET','/me')
        const userName=me.user?.name||''
        if(me.hasPet){const pet=await api<any>('GET','/pets/me');applyPetResponse(pet);state.userName=userName;applyDecay();startGame();return}
        else{state={userName};buildPicks();showScreen('s-select');return}
      } catch(_){ token=null;localStorage.removeItem(TOKEN_KEY) }
    }
    checkLogin()
  })()

  return () => {
    cancelAnimationFrame(animId)
    intervals.forEach(clearInterval)
    if(svT) clearTimeout(svT)
  }
}
