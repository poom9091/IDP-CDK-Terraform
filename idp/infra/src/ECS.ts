import { Construct } from "constructs";
import { ecs } from "@cdktf/provider-aws"
import {EcsCluster, EcsService, EcsTaskDefinition} from "@cdktf/provider-aws/lib/ecs";

interface Cluster {
  name: string,
  environment: string,
}

interface Service {
  name: string,
  image: string,
  cpu: number,
  memory: number
  hostPort: number,
  containerPort: number 
}

export class ECS  extends Construct {
  public ecsCluster: EcsCluster;
  constructor(scope: Construct, config: Cluster){
    super(scope,config.name);
    this.ecsCluster = new ecs.EcsCluster(this,"ecs-cluster",{
       name: `${config.environment}-${config.name}` 
    })
  }

  public createService(config: Service): EcsService { 
    this.createTaskDefinition(config)
    const { name } = config
    const ecsService: EcsService = new ecs.EcsService(this,name,{ 
        name: name,
        cluster: this.ecsCluster.arn
    }) 
    return ecsService
  }

  private createTaskDefinition(config: Service): EcsTaskDefinition {
    const { name, image, cpu,memory, containerPort, hostPort } = config
    const taskDefinition = new ecs.EcsTaskDefinition(this,name,{
      family: `${name}-task`,
      containerDefinitions: `{
        name      = "first"
        image     = ${image}
        cpu       = ${cpu}
        memory    = ${memory}
        essential = true
        portMappings = [
          {
            containerPort = ${containerPort} 
            hostPort      = ${hostPort} 
          }
        ]
      }`
    }) 
    return taskDefinition
  }
}
