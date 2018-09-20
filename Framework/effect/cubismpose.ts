/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at http://live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import {Live2DCubismFramework as cubismid} from "../id/cubismid";
import {Live2DCubismFramework as csmvector} from "../type/csmvector";
import {Live2DCubismFramework as cubismmodel} from "../model/cubismmodel";
import {Live2DCubismFramework as cubismframework} from "../live2dcubismframework";
import {Live2DCubismFramework as cubismjson} from "../utils/cubismjson";
import CubismIdHandle = cubismid.CubismIdHandle;
import csmVector = csmvector.csmVector;
import CubismModel = cubismmodel.CubismModel;
import CubismFramework = cubismframework.CubismFramework;
import CubismJson = cubismjson.CubismJson;
import Value = cubismjson.Value;


export namespace Live2DCubismFramework
{
    const Epsilon: number = 0.001;
    const DefaultFadeInSeconds: number = 0.5;
    
    // Pose.jsonのタグ
    const FadeIn: string = "FadeInTime";
    const Link: string = "Link";
    const Groups: string = "Groups";
    const Id: string = "Id";


    /**
     * パーツの不透明度の設定
     * 
     * パーツの不透明度の管理と設定を行う。
     */
    export class CubismPose
    {
        /**
         * インスタンスの作成
         * @param pose3json pose3.jsonのデータ
         * @param size pose3.jsonのデータのサイズ[byte]
         * @return 作成されたインスタンス
         */
        public static create(pose3json: ArrayBuffer, size: number): CubismPose
        {
            let ret: CubismPose = new CubismPose();
            let json: CubismJson = CubismJson.create(pose3json, size);
            let root: Value = json.getRoot();

            // フェード時間の指定
            if(root.getMap().isExist(FadeIn))
            {
                ret._fadeTimeSeconds = root.getMap().getValue(FadeIn).toFloat(DefaultFadeInSeconds);

                if(ret._fadeTimeSeconds <= 0.0)
                {
                    ret._fadeTimeSeconds = DefaultFadeInSeconds;
                }
            }

            // パーツグループ
            let poseListInfo: Value = root.getMap().getValue(Groups);
            const poseCount: number = poseListInfo.getSize();

            for(let poseIndex: number = 0; poseIndex < poseCount; ++poseIndex)
            {
                let idListInfo: Value = poseListInfo.getVector().at(poseIndex);
                const idCount: number = idListInfo.getSize();
                let groupCount: number = 0;

                for(let groupIndex: number = 0; groupIndex < idCount; ++groupIndex)
                {
                    let partInfo: Value = idListInfo.getVector().at(groupIndex);
                    let partData: CubismPose.PartData = new CubismPose.PartData();
                    const parameterId: CubismIdHandle = CubismFramework.getIdManager().getId(partInfo.getMap().getValue(Id).getRawString());

                    partData.partId = parameterId;

                    // リンクするパーツの設定
                    if(partInfo.getMap().isExist(Link))
                    {
                        let linkListInfo: Value = partInfo.getMap().getValue(Link);
                        const linkCount: number = linkListInfo.getSize();

                        for(let linkIndex: number = 0; linkIndex < linkCount; ++linkIndex)
                        {
                            let linkPart: CubismPose.PartData = new CubismPose.PartData();
                            const linkId: CubismIdHandle = CubismFramework.getIdManager().getId(linkListInfo.getVector().at(linkIndex).getString());

                            linkPart.partId = linkId;

                            partData.link.pushBack(linkPart);
                        }
                    }

                    ret._partGroups.pushBack(partData.clone());

                    ++groupCount;
                }

                ret._partGroupCounts.pushBack(groupCount);
            }

            CubismJson.delete(json);

            return ret;
        }

        /**
         * インスタンスを破棄する
         * @param pose 対象のCubismPose
         */
        public static delete(pose: CubismPose): void
        {
            pose = void 0;
            pose = null;
        }

        /**
         * モデルのパラメータの更新
         * @param model 対象のモデル
         * @param deltaTimeSeconds デルタ時間[秒]
         */
        public updateParameters(model: CubismModel, deltaTimeSeconds: number): void
        {
            // 前回のモデルと同じでない場合は初期化が必要
            if(model != this._lastModel)
            {
                // パラメータインデックスの初期化
                this.reset(model);
            }

            this._lastModel = model;

            // 設定から時間を変更すると、経過時間がマイナスになる事があるので、経過時間0として対応
            if(deltaTimeSeconds < 0.0)
            {
                deltaTimeSeconds = 0.0;
            }

            let beginIndex: number = 0;

            for(let i = 0; i < this._partGroupCounts.getSize(); i++)
            {
                const partGroupCount: number = this._partGroupCounts.at(i);

                this.doFade(model, deltaTimeSeconds, beginIndex, partGroupCount);

                beginIndex += partGroupCount;
            }

            this.copyPartOpacities(model);
        }

        /**
         * 表示を初期化
         * @param model 対象のモデル
         * @note 不透明度の初期値が0でないパラメータは、不透明度を１に設定する
         */
        public reset(model: CubismModel): void
        {
            let beginIndex: number = 0;

            for(let i: number = 0; i < this._partGroupCounts.getSize(); ++i)
            {
                const groupCount: number = this._partGroupCounts.at(i);

                for(let j: number = beginIndex; j < beginIndex + groupCount; ++j)
                {
                    this._partGroups.at(j).initialize(model);

                    const partsIndex: number = this._partGroups.at(j).partIndex;
                    const paramIndex: number = this._partGroups.at(j).parameterIndex;

                    if(partsIndex < 0)
                    {
                        continue;
                    }

                    model.setPartOpacityByIndex(partsIndex, (j == beginIndex ? 1.0 : 0.0));
                    model.setParameterValueByIndex(paramIndex, (j == beginIndex ? 1.0: 0.0));

                    for(let k: number = 0; k < this._partGroups.at(j).link.getSize(); ++k)
                    {
                        this._partGroups.at(j).link.at(k).initialize(model);
                    }
                }

                beginIndex += groupCount;
            }
        }

        /**
         * パーツの不透明度をコピー
         * 
         * @param model 対象のモデル
         */
        public copyPartOpacities(model: CubismModel): void
        {
            for(let groupIndex: number = 0; groupIndex < this._partGroups.getSize(); ++groupIndex)
            {
                let partData: CubismPose.PartData = this._partGroups.at(groupIndex);

                if(partData.link.getSize() == 0)
                {
                    continue;   // 連動するパラメータはない
                }

                const partIndex: number = this._partGroups.at(groupIndex).partIndex;
                const opacity: number = model.getPartOpacityByIndex(partIndex);

                for(let linkIndex: number = 0; linkIndex < partData.link.getSize(); ++linkIndex)
                {
                    let linkPart: CubismPose.PartData = partData.link.at(linkIndex);
                    const linkPartIndex: number = linkPart.partIndex;

                    if(linkPartIndex < 0)
                    {
                        continue;
                    }

                    model.setPartOpacityByIndex(linkPartIndex, opacity);
                }
            }
        }

        /**
         * パーツのフェード操作を行う。
         * @param model 対象のモデル
         * @param deltaTimeSeconds デルタ時間[秒]
         * @param beginIndex フェード操作を行うパーツグループの先頭インデックス
         * @param partGroupCount フェード操作を行うパーツグループの個数
         */
        public doFade(model: CubismModel, deltaTimeSeconds: number, beginIndex: number, partGroupCount: number): void
        {
            let visiblePartIndex: number = -1;
            let newOpacity: number = 1.0;

            const phi: number = 0.5;
            const backOpacityThreshold: number = 0.15;

            // 現在、表示状態になっているパーツを取得
            for(let i: number = beginIndex; i < beginIndex + partGroupCount; ++i)
            {
                const partIndex: number = this._partGroups.at(i).partIndex;
                const paramIndex: number = this._partGroups.at(i).parameterIndex;

                if(model.getParameterValueByIndex(paramIndex) > Epsilon)
                {
                    if(visiblePartIndex >= 0)
                    {
                        break;
                    }

                    visiblePartIndex = i;
                    newOpacity = model.getPartOpacityByIndex(partIndex);

                    // 新しい不透明度を計算
                    newOpacity += (deltaTimeSeconds / this._fadeTimeSeconds);

                    if(newOpacity > 1.0)
                    {
                        newOpacity = 1.0;
                    }
                }
            }

            if(visiblePartIndex < 0)
            {
                visiblePartIndex = 0;
                newOpacity = 1.0;
            }

            // 表示パーツ、非表示パーツの不透明度を設定する
            for(let i: number = beginIndex; i < beginIndex + partGroupCount; ++i)
            {
                const partsIndex: number = this._partGroups.at(i).partIndex;

                // 表示パーツの設定
                if(visiblePartIndex == i)
                {
                    model.setPartOpacityByIndex(partsIndex, newOpacity);   // 先に設定
                }
                // 非表示パーツの設定
                else
                {
                    let opacity: number = model.getPartOpacityByIndex(partsIndex);
                    let a1: number; // 計算によって求められる不透明度

                    if(newOpacity < phi)
                    {
                        a1 = newOpacity * (phi - 1) / phi + 1.0;    // (0,1),(phi,phi)を通る直線式
                    }
                    else
                    {
                        a1 = (1 - newOpacity) * phi / (1.0 - phi);  // (1,0),(phi,phi)を通る直線式
                    }

                    // 背景の見える割合を制限する場合
                    const backOpacity: number = (1.0 - a1) * (1.0 - newOpacity);

                    if(backOpacity > backOpacityThreshold)
                    {
                        a1 = 1.0 - backOpacityThreshold / (1.0 - newOpacity);
                    }

                    if(opacity > a1)
                    {
                        opacity = a1;   // 計算の不透明度よりも大きければ（濃ければ）不透明度を上げる
                    }

                    model.setPartOpacityByIndex(partsIndex, opacity);
                }
            }
        }

        /**
         * コンストラクタ
         */
        public constructor()
        {
            this._fadeTimeSeconds = DefaultFadeInSeconds;
            this._lastModel = null;
            this._partGroups = new csmVector<CubismPose.PartData>();
            this._partGroupCounts = new csmVector<number>();
        }

        _partGroups: csmVector<CubismPose.PartData>; // パーツグループ
        _partGroupCounts: csmVector<number>;         // それぞれのパーツグループの個数
        _fadeTimeSeconds: number;           // フェード時間[秒]
        _lastModel: CubismModel;            // 前回操作したモデル
    }

    export namespace CubismPose
    {
        /**
         * パーツにまつわるデータを管理
         */
        export class PartData
        {
            /**
             * コンストラクタ
             */
            constructor(v?: PartData)
            {
                this.parameterIndex = 0;
                this.partIndex = 0;
                this.link = new csmVector<PartData>();
                
                if(v != undefined)
                {
                    this.partId = v.partId;

                    for(const ite: csmVector.iterator<PartData> = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement())
                    {
                        this.link.pushBack(ite.ptr().clone());
                    }
                }
            }

            /**
             * =演算子のオーバーロード
             */
            public assignment(v: PartData): PartData
            {
                this.partId = v.partId;

                for(const ite: csmVector.iterator<PartData> = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement())
                {
                    this.link.pushBack(ite.ptr().clone());
                }

                return this;
            }

            /**
             * 初期化
             * @param model 初期化に使用するモデル
             */
            public initialize(model: CubismModel): void
            {
                this.parameterIndex = model.getParameterIndex(this.partId);
                this.partIndex = model.getPartIndex(this.partId);

                model.setParameterValueByIndex(this.parameterIndex, 1);
            }

            /**
             * オブジェクトのコピーを生成する
             */
            public clone(): PartData
            {
                let clonePartData: PartData = new PartData();

                clonePartData.partId = this.partId;
                clonePartData.parameterIndex = this.parameterIndex;
                clonePartData.partIndex = this.partIndex;
                clonePartData.link = new csmVector<PartData>();

                for(let ite: csmVector.iterator<PartData> = this.link.begin(); ite.notEqual(this.link.end()); ite.increment())
                {
                    clonePartData.link.pushBack(ite.ptr().clone());
                }

                return clonePartData;
            }
            
            partId: CubismIdHandle;   // パーツID
            parameterIndex: number; // パラメータのインデックス
            partIndex: number;  // パーツのインデックス
            link: csmVector<PartData>;   // 連動するパラメータ
        }
    }
}