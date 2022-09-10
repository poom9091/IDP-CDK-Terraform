import { Construct } from "constructs";
import { ecs,ssm } from "@cdktf/provider-aws"
import {EcsCluster } from "@cdktf/provider-aws/lib/ecs";

interface Cluster {
  name: string,
  environment: string,
}

export class ECS  extends Construct {
  public ecsCluster: EcsCluster;
  constructor(scope: Construct, config: Cluster){
    super(scope,config.name);
    this.ecsCluster = new ecs.EcsCluster(this,"ecs-cluster",{
       name: `${config.environment}-${config.name}` 
    })
    
    const ecsCluster = new ecs.EcsClusterCapacityProviders(this,"ecs-cluster-fargate",{ 
      clusterName: this.ecsCluster.name,
      capacityProviders: ["FARGATE"]
    })

    new ssm.SsmParameter(this,`ecsCluster`,{
      name: `/${config.environment}/ecs_cluster`, 
      type: "String",
      value: ecsCluster.clusterName
    }) 
  }
}
