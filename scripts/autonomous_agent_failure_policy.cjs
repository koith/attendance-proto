'use strict';
// This policy reports the stage that actually failed; never claim that the
// five-attempt repair loop ran when the token or dependencies were missing.
function classifyAgentFailure({preflight,dependencies,implementation}={}) {
  if(preflight!=='success')return {stage:'preflight',
    message:'AI 개발 시작 전 승인·자격 증명 확인에 실패했습니다. 자동 수정 시도는 시작되지 않았습니다.'};
  if(dependencies!=='success')return {stage:'dependencies',
    message:'AI 모델/브라우저 개발 도구 설치 단계에서 실패했습니다. 자동 수정 시도는 시작되지 않았습니다.'};
  if(implementation!=='success')return {stage:'implementation',
    message:'자동 개발·기능 QA·PR 생성 단계가 실패했습니다. 반복 시도 횟수와 원인은 Actions 로그에서 확인해야 합니다.'};
  return {stage:'unexpected',
    message:'워크플로가 예기치 않게 실패했습니다. 자동 개발 성공으로 판정하지 않습니다.'};
}
module.exports={classifyAgentFailure};
