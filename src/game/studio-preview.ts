import { REAL_DAY_MS } from "./base-data";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildWorldRegistryFromStudio } from "./data/registry";
import { type ContentStudioDocument } from "./content-studio";
import { inspectStudio } from "./studio-validation";
import { setPreviewContentVersion, releasePreviewContentVersion } from "./content-versions";
import { createInitialGameState, performAction, refreshLocationKnowledge, syncScene } from "./rules";
import { resolveStoryFrame } from "./story-flow";
import { evaluateCondition } from "./state-utils";
import { resolveItemText } from "./item-text";
import { GameActionSchema, type GameState, type ContentRegistry } from "./schemas";

const SetupSchema = z.object({
  locationId:z.string().optional(), storyId:z.string().optional(), sceneId:z.string().optional(),
  day:z.number().int().min(1).max(9).optional(),
  inventory:z.record(z.string(),z.number().int().nonnegative()).optional(),
  flags:z.record(z.string(),z.union([z.boolean(),z.number(),z.string()])).optional(),
});
const JumpSchema=z.object({storyId:z.string(),sceneId:z.string()}).strict();
const StepSchema=z.object({
  action:GameActionSchema.optional(),setup:SetupSchema.omit({sceneId:true,storyId:true}).strict().optional(),
  undo:z.literal(true).optional(),jump:JumpSchema.optional(),document:z.unknown().optional(),
}).strict().refine(value=>{
  const count=[value.action,value.setup,value.undo,value.jump].filter(Boolean).length;
  return count<=1 && (count===1 || value.document!==undefined);
},"선택, 상황 변경, 직접 이동, 되돌리기 중 하나만 요청해 주세요.");
type EditorTarget={tab:"stories"|"locations";id:string;sceneId?:string;choiceId?:string;actionId?:string};
type TraceEntry={sceneId:string;label:string;kind:"choice"|"action"|"jump"|"setup";fromTitle:string;toSceneId:string;toTitle:string;source?:EditorTarget};
type Preview={
  document:ContentStudioDocument;state:GameState;registry:ContentRegistry;touched:number;
  origin:{sceneId:string;title:string};trace:TraceEntry[];
  history:Array<{state:GameState;trace:TraceEntry[]}>;
};
const TTL=3600000;

export class StudioPreviewService {
  private sessions=new Map<string,Preview>();
  private cleanupTimer=setInterval(()=>this.expire(),60000).unref();
  close(id:string){this.sessions.delete(id);releasePreviewContentVersion(id);}
  dispose(){clearInterval(this.cleanupTimer);for(const id of this.sessions.keys())this.close(id);}
  private expire(){for(const [id,row] of this.sessions)if(Date.now()-row.touched>TTL)this.close(id);}
  private prepare(input:unknown){
    const result=inspectStudio(input),errors=result.issues.filter(issue=>issue.severity==="error");
    if(!result.document||errors.length)throw new Error(errors.slice(0,3).map(issue=>issue.message).join(" / ")||"시험할 원고의 형식을 확인해 주세요.");
    return {document:result.document,registry:buildWorldRegistryFromStudio(result.document)};
  }
  private sceneTarget(document:ContentStudioDocument,sceneId:string):EditorTarget|undefined{
    const story=document.stories.find(story=>story.scenes.some(scene=>scene.id===sceneId));
    return story?{tab:"stories",id:story.id,sceneId}:undefined;
  }
  private choiceTarget(row:Preview,sceneId:string,choiceId:string,action:boolean):EditorTarget|undefined{
    const entryStory=action?row.document.stories.find(story=>"studio_story_"+story.id===choiceId):undefined;
    if(entryStory)return {tab:"stories",id:entryStory.id,sceneId:entryStory.scenes[0]?.id};
    if(action)return {tab:"locations",id:row.registry.scenes[sceneId]?.locationId??row.state.location,actionId:choiceId};
    const sourceSceneId=row.registry.scenes[sceneId]?.sourceSceneId??sceneId;
    const source=this.sceneTarget(row.document,sourceSceneId);
    const authored=row.document.stories.find(story=>story.id===source?.id)?.scenes.find(scene=>scene.id===sourceSceneId)?.choices.some(choice=>choice.id===choiceId);
    return source?{...source,...(authored?{choiceId}:{})}:undefined;
  }
  private assertCurrent(state:GameState,registry:ContentRegistry){
    if(!registry.locations[state.location]||!registry.scenes[state.sceneId])throw new Error("시험 중인 장면 또는 지역이 삭제되었습니다. 원고를 복원하거나 현재 장면부터 다시 시작해 주세요.");
    if(resolveStoryFrame(state,registry).scene.id!==state.sceneId)throw new Error("현재 시험 상태가 장면 표시 조건과 맞지 않습니다. 시험 조건을 바꾸거나 현재 장면부터 다시 시작해 주세요.");
  }
  private jump(state:GameState,document:ContentStudioDocument,registry:ContentRegistry,target:z.infer<typeof JumpSchema>){
    const story=document.stories.find(story=>story.id===target.storyId),scene=story?.scenes.find(scene=>scene.id===target.sceneId);
    if(!story||!scene)throw new Error("이동할 장면은 선택한 이벤트 안에 있어야 합니다.");
    if(!registry.scenes[scene.id])throw new Error("게임에 포함되지 않은 장면입니다. 이야기 설정을 확인해 주세요.");
    state.location=scene.locationId;
    if(!story.native)state.flags["studio_started_"+story.id]=true;
    refreshLocationKnowledge(state);syncScene(state,scene.id);
    if(state.sceneId!==scene.id)throw new Error("현재 시험 조건으로 이 장면을 표시할 수 없습니다. 날짜·아이템·진행 상태를 설정해 주세요.");
    this.assertCurrent(state,registry);
  }
  start(input:unknown,setup:unknown){
    this.expire();
    const prepared=this.prepare(input),parsed=SetupSchema.parse(setup??{});
    const id=randomUUID(),state=createInitialGameState();
    state.contentVersionId=setPreviewContentVersion(id,prepared.registry);
    try{
      const story=prepared.document.stories.find(story=>story.id===parsed.storyId);
      if(parsed.storyId&&!story)throw new Error("시험할 이벤트를 찾을 수 없습니다.");
      if(parsed.sceneId&&!story?.scenes.some(scene=>scene.id===parsed.sceneId))throw new Error("시작 장면은 선택한 이벤트 안에 있어야 합니다.");
      state.location=parsed.locationId??story?.locationId??"shelter";
      if(!prepared.registry.locations[state.location])throw new Error("시험 지역을 찾을 수 없습니다.");
      state.sceneId="";state.flags={...state.flags,opening_seen:true,...(parsed.flags??{})};
      state.day=parsed.day??1;state.worldElapsedMs=(state.day-1)*REAL_DAY_MS;
      if(parsed.inventory)state.inventory=parsed.inventory;
      refreshLocationKnowledge(state);syncScene(state);
      if(parsed.sceneId&&story)this.jump(state,prepared.document,prepared.registry,{storyId:story.id,sceneId:parsed.sceneId});
      else if(story&&!story.native){
        const action=prepared.registry.actions["studio_story_"+story.id];
        if(action?.conditions.every(condition=>evaluateCondition(condition,state)))performAction(state,{type:"content_action",actionId:action.id});
      }else if(story?.scenes[0])syncScene(state,story.scenes[0].id);
      const frame=resolveStoryFrame(state,prepared.registry);
      const row:Preview={...prepared,state,touched:Date.now(),trace:[],history:[],origin:{sceneId:frame.scene.id,title:resolveItemText(frame.scene.title,prepared.registry)}};
      const response=this.present(id,row);
      if(this.sessions.size>=30)this.close(this.sessions.keys().next().value!);
      this.sessions.set(id,row);return response;
    }catch(error){releasePreviewContentVersion(id);throw error;}
  }
  step(id:string,input:unknown){
    this.expire();
    const row=this.sessions.get(id);
    if(!row)throw new Error("시험 플레이가 만료되었습니다. 현재 장면부터 다시 시작해 주세요.");
    const request=StepSchema.parse(input);
    const prepared=request.document!==undefined?this.prepare(request.document):{document:row.document,registry:row.registry};
    const working=structuredClone(row.state),trace=structuredClone(row.trace);
    // All rule evaluation is synchronous. A failed candidate restores the binding
    // before another request can observe it. Real game versions remain immutable.
    working.contentVersionId=setPreviewContentVersion(id,prepared.registry);
    const candidate:Preview={...row,...prepared,state:working,trace,history:[...row.history],touched:Date.now()};
    try{
      if(request.undo){
        const previous=candidate.history.pop();
        if(!previous)throw new Error("되돌릴 시험 진행이 없습니다.");
        candidate.state=structuredClone(previous.state);candidate.trace=structuredClone(previous.trace);
        candidate.state.contentVersionId=working.contentVersionId;this.assertCurrent(candidate.state,candidate.registry);
      }else{
        if(!prepared.registry.locations[working.location]||!prepared.registry.scenes[working.sceneId])this.assertCurrent(working,prepared.registry);
        const from=prepared.registry.scenes[working.sceneId];
        working.lastRealTimestamp=Date.now();
        let kind:TraceEntry["kind"]|undefined,label="",source:EditorTarget|undefined;
        if(request.setup){
          const setup=request.setup;
          if(setup.day!==undefined){working.day=setup.day;working.worldElapsedMs=(working.day-1)*REAL_DAY_MS;working.phaseIndex=0;}
          if(setup.locationId&&setup.locationId!==working.location){
            if(!prepared.registry.locations[setup.locationId])throw new Error("지역을 찾을 수 없습니다.");
            working.location=setup.locationId;working.sceneId="";
          }
          if(setup.inventory)working.inventory=setup.inventory;
          if(setup.flags)Object.assign(working.flags,setup.flags);
          refreshLocationKnowledge(working);syncScene(working);kind="setup";label="시험 조건 변경";
        }else if(request.jump){
          this.jump(working,prepared.document,prepared.registry,request.jump);
          kind="jump";label="편집기에서 직접 이동";
        }else{
          this.assertCurrent(working,prepared.registry);
          if(request.action){
            const action=request.action,frame=resolveStoryFrame(working,prepared.registry);
            if(action.type!=="content_choice"&&action.type!=="content_action")throw new Error("현재 미리보기의 선택지를 사용해 주세요.");
            const actionId=action.type==="content_choice"?action.choiceId:action.actionId;
            if(!frame.choices.some(choice=>choice.id===actionId&&choice.isAvailable&&choice.serverActionHint.type===action.type))throw new Error("현재 장면에서 선택할 수 없습니다.");
            const definition=action.type==="content_choice"?prepared.registry.choices[actionId]:prepared.registry.actions[actionId];
            kind=action.type==="content_choice"?"choice":"action";label=resolveItemText(definition.label,prepared.registry);
            source=this.choiceTarget(candidate,from.id,actionId,kind==="action");
            performAction(working,action);
            if(definition.nextEventId){
              const event=prepared.registry.events[definition.nextEventId];
              if(!event)throw new Error("이어지는 이벤트를 찾을 수 없습니다.");
              working.flags["event_seen_"+event.id]=true;syncScene(working,event.startSceneId);
            }
          }
        }
        if(kind){
          const to=resolveStoryFrame(working,prepared.registry).scene;
          candidate.trace.push({sceneId:from.id,fromTitle:resolveItemText(from.title,prepared.registry),toSceneId:to.id,toTitle:resolveItemText(to.title,prepared.registry),label,kind,source});
          candidate.history.push({state:structuredClone(row.state),trace:structuredClone(row.trace)});
          if(candidate.history.length>100)candidate.history.shift();
        }
      }
      const response=this.present(id,candidate);this.sessions.set(id,candidate);return response;
    }catch(error){setPreviewContentVersion(id,row.registry);throw error;}
  }
  private present(id:string,row:Preview){
    const frame=resolveStoryFrame(row.state,row.registry),location=row.registry.locations[row.state.location];
    const definitions=[...frame.scene.choiceIds.map(id=>row.registry.choices[id]),...(frame.scene.suppressLocationInteractions?[]:location.interactionChoices)].filter(Boolean);
    return {
      id,sceneId:frame.scene.id,sourceSceneId:frame.scene.sourceSceneId,title:resolveItemText(frame.scene.title,row.registry),editorTarget:this.sceneTarget(row.document,frame.scene.sourceSceneId??frame.scene.id),
      imagePath:location.imagePath||"assets/scenes/camp.svg",locationName:location.name,
      paragraphs:frame.scene.paragraphs.map(paragraph=>resolveItemText(paragraph,row.registry)),
      choices:frame.choices.map(choice=>({
        id:choice.id,label:resolveItemText(choice.label,row.registry),available:choice.isAvailable,action:choice.serverActionHint,
        outcomeHint:resolveItemText(choice.outcomeHint??"",row.registry),showOutcomeHint:choice.showOutcomeHint,remainingUses:choice.remainingUses,
        editorTarget:this.choiceTarget(row,frame.scene.id,choice.id,choice.serverActionHint.type==="content_action"),
      })),
      unmet:definitions.filter(definition=>!frame.choices.some(choice=>choice.id===definition.id&&choice.isAvailable)).map(definition=>({
        id:definition.id,label:resolveItemText(definition.label,row.registry),conditions:definition.conditions.filter(condition=>!evaluateCondition(condition,row.state)),
        reason:"hidden" in definition&&definition.hidden?"숨김 설정":"선택 조건 또는 사용 횟수 제한",
      })),
      inventory:row.state.inventory,day:row.state.day,locationId:row.state.location,stats:row.state.stats,isGameOver:row.state.isGameOver,
      systemNote:row.state.systemNote,systemNoteEntries:row.state.systemNoteEntries,trace:row.trace,origin:row.origin,canUndo:row.history.length>0,
    };
  }
}
