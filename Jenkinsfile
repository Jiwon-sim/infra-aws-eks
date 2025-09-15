pipeline {
    agent {
        kubernetes {
            yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["/busybox/cat"]
    tty: true
  - name: trivy
    image: aquasec/trivy:latest
    command: ["/bin/sh"]
    tty: true
"""
        }
    }
    
    environment {
        HARBOR_URL = 'harbor.local'
        IMAGE_NAME = 'url-shortener'
        SONAR_PROJECT_KEY = 'url-shortener'
    }
    
    stages {
        stage('Build') {
            steps {
                script {
                    sh 'npm ci'
                    sh 'npm run build'
                }
            }
        }
        
        stage('SAST - SonarQube') {
            steps {
                script {
                    withSonarQubeEnv('SonarQube') {
                        sh 'npm run sonar-scanner'
                    }
                    timeout(time: 10, unit: 'MINUTES') {
                        def qg = waitForQualityGate()
                        if (qg.status != 'OK') {
                            slackSend(channel: '#ci-cd-alerts', 
                                     color: 'danger',
                                     message: "❌ SAST Failed: Quality Gate failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}")
                            error "Quality Gate failed: ${qg.status}"
                        }
                    }
                }
            }
        }
        
        stage('Build & Scan Image') {
            parallel {
                stage('Build Image') {
                    steps {
                        container('kaniko') {
                            script {
                                sh """
                                /kaniko/executor \\
                                --dockerfile=Dockerfile \\
                                --context=. \\
                                --destination=${HARBOR_URL}/library/${IMAGE_NAME}:${BUILD_NUMBER} \\
                                --destination=${HARBOR_URL}/library/${IMAGE_NAME}:latest
                                """
                            }
                        }
                    }
                }
                
                stage('SCA & Image Scan') {
                    steps {
                        container('trivy') {
                            script {
                                sh """
                                trivy fs --format json --output trivy-fs.json .
                                trivy image --format json --output trivy-image.json ${HARBOR_URL}/library/${IMAGE_NAME}:${BUILD_NUMBER}
                                """
                                
                                def fsResults = readJSON file: 'trivy-fs.json'
                                def imageResults = readJSON file: 'trivy-image.json'
                                
                                def criticalCount = 0
                                def highCount = 0
                                
                                [fsResults, imageResults].each { result ->
                                    result.Results?.each { r ->
                                        r.Vulnerabilities?.each { vuln ->
                                            if (vuln.Severity == 'CRITICAL') criticalCount++
                                            if (vuln.Severity == 'HIGH') highCount++
                                        }
                                    }
                                }
                                
                                if (criticalCount > 0) {
                                    slackSend(channel: '#ci-cd-alerts',
                                             color: 'danger', 
                                             message: "🚨 Security Scan: ${criticalCount} CRITICAL, ${highCount} HIGH vulnerabilities found")
                                    error "Critical vulnerabilities found"
                                }
                            }
                        }
                    }
                }
            }
        }
        
        stage('Sign Image') {
            steps {
                script {
                    sh """
                    cosign sign --key cosign.key ${HARBOR_URL}/library/${IMAGE_NAME}:${BUILD_NUMBER}
                    """
                }
            }
        }
        
        stage('Update Staging') {
            steps {
                script {
                    sh """
                    cd gitops/apps/urlshortener/staging
                    kustomize edit set image harbor.example.com/urlshortener/app:${BUILD_NUMBER}
                    git add .
                    git commit -m "Update staging to ${BUILD_NUMBER}"
                    git push origin main
                    """
                    
                    slackSend(channel: '#ci-cd-alerts',
                             color: 'good',
                             message: "✅ Staging Updated: urlshortener:${BUILD_NUMBER}")
                }
            }
        }
    }
    
    post {
        failure {
            slackSend(channel: '#ci-cd-alerts',
                     color: 'danger', 
                     message: "❌ Pipeline Failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}")
        }
        success {
            slackSend(channel: '#ci-cd-alerts',
                     color: 'good',
                     message: "✅ Pipeline Success: ${env.JOB_NAME} #${env.BUILD_NUMBER}")
        }
    }
}