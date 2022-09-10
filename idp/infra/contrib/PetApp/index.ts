import { Construct } from "constructs";
import {  TerraformStack, Fn, TerraformOutput } from "cdktf";
import { SecurityGroup} from "../../.gen/modules/security_group";
import { AwsProvider, ecr, iam, elb, ecs, codebuild, ssm } from "@cdktf/provider-aws"  

interface PetAppConfig {
  environment: string;
  project: string;
  region: string;
  profile: string;
  publicSubnets: string[];
  vpcId: string;
  image: string;
  cpu: number;
  memory: number;
  containerPort: number;
  clusterId: string;
  githubRepo: string;
  githubBranch: string;
  securityGroupsApp: SecurityGroup;
  securityGroupsLB: SecurityGroup;
} 

export default class  PetAppStack extends TerraformStack{ 
  constructor(scope: Construct,name: string,config: PetAppConfig) { 
    super(scope,name)

    new AwsProvider(this,config.environment,{
      region: config.region,
      profile: config.profile, 
    })
    
    const ecrRepo = new ecr.EcrRepository(this,`${config.environment}-${config.profile}-ecr`,{
      name: `${config.environment}-${config.project}`
    }) 

    new ssm.SsmParameter(this,`parameter-ecr`,{
      name: `/${config.environment}/image_repo_name`,
      type: "String",
      value: ecrRepo.repositoryUrl
    }) 

     const role = new iam.IamRole(this,`${config.environment}-${config.profile}-role`,{  
      name: `${config.environment}-${config.profile}-role`,
      assumeRolePolicy: `{
        "Version": "2008-10-17",
        "Statement": [
          {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
              "Service": "codebuild.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }`
    })

    new iam.IamRolePolicy(this,`${config.environment}-${config.profile}-role-policy`,{
      name: `${config.environment}-policy`, 
      role: role.id,
      policy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": [
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "ecr:BatchCheckLayerAvailability",              
              "ssm:GetParameters"
            ],
            "Effect": "Allow",
            "Resource": "*"
          }
        ]
      }`
    })

    // const securityGroups: { [key: string]: SecurityGroup } = {}; 
    // securityGroups.alb = new SecurityGroup(this,`${config.environment}-sp-public`,{ 
    //   name: `${config.environment}-sp-public`,
    //   vpcId: config.vpcId,
    //   ingressWithSelf: [{ rule: "all-all" }],
    //   egressWithSelf: [{ rule: "all-all" }],
    //   egressCidrBlocks: ["0.0.0.0/0"],
    //   egressRules: ["all-all"],
    //   ingressCidrBlocks: ["0.0.0.0/0"],
    //   ingressRules: ["https-443-tcp","http-80-tcp"],
    // })

    const lb = new elb.Lb(this,`${config.environment}-${config.profile}-lb`,{
      name: `${config.environment}-${config.profile}-lb`,
      loadBalancerType: "application",
      securityGroups: [config.securityGroupsLB.securityGroupIdOutput],  
      subnets: config.publicSubnets
      // securityGroups: [securityGroups.alb.securityGroupIdOutput], subnets: config.publicSubnets
    }) 

    new TerraformOutput (this,`LB-link`,{
      value: lb.dnsName
    })

    const targetGroup = new elb.LbTargetGroup(this,`${config.environment}-${config.profile}-target-lb`,{
      name: `${config.environment}-${config.profile}-target-lb`,
      port: 80,
      targetType: "ip",
      protocol: "HTTP",
      vpcId: config.vpcId
    }) 

    new elb.LbListener(this,`${config.environment}-${config.profile}-forward`,{
      loadBalancerArn: lb.arn,
      port: 80,
      protocol: "HTTP",

      defaultAction: [{
        type: "forward",
        targetGroupArn: targetGroup.arn
      }]
    })

    const ecsIamRole = new iam.IamRole(this,`ecs-task-iam-role`,{  
      name: `${config.environment}-${config.project}-ecs-task-role`,
      assumeRolePolicy: Fn.jsonencode({
        "Version": "2012-10-17", 
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      })
    }) 

    new iam.IamRolePolicyAttachment(this,`ecs-iam-policy-attachment`,{  
      role: ecsIamRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    })  

    // @ts-ignore
    const taskDefinition = new ecs.EcsTaskDefinition(this,`${config.environment}-${config.profile}-task-definition`,{ 
      family: config.project,
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
      cpu: Fn.tostring(config.cpu), 
      executionRoleArn: ecsIamRole.arn,
      memory: Fn.tostring(config.memory),
      containerDefinitions: Fn.jsonencode([{
        name: config.project,
        image: ecrRepo.repositoryUrl,
        cpu: config.cpu, 
        memory: config.memory,
        essential: true,
        portMappings: [
          {
            containerPort: config.containerPort 
          }
        ]
      }]) 
    }) 

    new ssm.SsmParameter(this,`taskDefinition`,{
      name: `/${config.environment}/task_definition_container_name`,
      type: "String",
      value: config.project
    }) 

    // @ts-ignore
    const service = new ecs.EcsService(this,`${config.environment}-${config.profile}-service`,{ 
      name: config.project,
      cluster: config.clusterId,
      taskDefinition: taskDefinition.arn,
      networkConfiguration:{
        subnets: config.publicSubnets, 
        assignPublicIp: true,
        securityGroups: [config.securityGroupsApp.securityGroupIdOutput]
      },
      desiredCount: 1, 
      launchType: "FARGATE",
      loadBalancer: [{
        targetGroupArn: targetGroup.arn,
        containerName: config.project,
        containerPort: config.containerPort
      }]
    }) 

    new ssm.SsmParameter(this,`escService`,{ 
      name: `/${config.environment}/ecs_service`, type: "String",
      value: service.name
    }) 
    
    const iamRole = new iam.IamRole(this,`codebuild-iam-role`,{  
      name: `${config.environment}-${config.project}-codebuild-role`,
      assumeRolePolicy: Fn.jsonencode({
        "Version": "2012-10-17", 
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "codebuild.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      })
    }) 

    const iamPolicy = new iam.IamPolicy(this,`codebuild-iam-role-policy`,{
      name: `${config.environment}-${config.project}-codebuild-policy` ,
      policy: Fn.jsonencode({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "cloudwatch:*",
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "s3:PutObject",
              "s3:GetObject",
              "s3:GetObjectVersion",
              "s3:GetBucketAcl",
              "s3:GetBucketLocation",

              // Allow CodeBuild access to AWS services required to create a VPC network interface
              "ec2:CreateNetworkInterface",
              "ec2:DescribeDhcpOptions",
              "ec2:DescribeNetworkInterfaces",
              "ec2:DeleteNetworkInterface",
              "ec2:DescribeSubnets",
              "ec2:DescribeSecurityGroups",
              "ec2:DescribeVpcs",
              "ec2:CreateNetworkInterfacePermission",
              "ssm:GetParameters",
              "ecr:*",
              // Required to run `aws ecs update-service`
              "ecs:UpdateService"
            ],
            "Resource": [
              "*",
            ]
          }
        ]
      })
    })
  
    new iam.IamRolePolicyAttachment(this,`codebuild-iam-policy-attachment`,{  
      role: iamRole.name,
      policyArn: iamPolicy.arn
    })  

    new codebuild.CodebuildProject(this,`${config.environment}-${config.project}-codebuild`,{ 
      name: `service-role`,
      serviceRole: iamRole.arn, 
      artifacts: {
        type: "NO_ARTIFACTS" 
      },
      environment: {
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:1.0",
        type: "LINUX_CONTAINER",
        imagePullCredentialsType: "CODEBUILD",
        privilegedMode: true,
        environmentVariable: [{
          name: "ENVIRONMENT",
          value: `${config.environment}`
        }]
      },
      
      sourceVersion: config.githubBranch,
      source: {
        type: "GITHUB",
        location: config.githubRepo, 
      }
    })
  } 
}

